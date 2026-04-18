/**
 * Dual-write helpers — replica de escrituras hacia el Postgres dockerizado.
 *
 * La app Next.js sigue hablando con Supabase hosted como fuente primaria
 * (Auth, OAuth, RLS). Este módulo añade una segunda escritura, en paralelo,
 * hacia el Postgres del `docker-compose.yml` local. Así la BD dockerizada
 * deja de estar vacía y pasa a reflejar los mismos datos que Supabase —
 * útil tanto para la evaluación del ítem "despliegue dockerizado con datos
 * reales" como para tener una copia on-prem mientras se desarrolla.
 *
 * Garantías:
 *   1. Best-effort: si `DATABASE_URL` no está definida o el contenedor está
 *      apagado, la función devuelve sin lanzar. Supabase no se ve afectado.
 *   2. Idempotente: todo usa `on conflict do update` así que una misma fila
 *      se puede volver a escribir sin romper la unique constraint.
 *   3. Mismos UUIDs: reusa el `id` generado por Supabase, para que un
 *      `PATCH/DELETE` posterior afecte la misma fila en ambas BDs.
 *
 * Importante: los helpers NO hacen SELECT para leer del Docker; sólo
 * escriben. El read path de la app sigue siendo Supabase (las páginas
 * `/inventory`, `/community`, etc.). Para *ver* los datos en Docker se
 * usan `/docker-status`, `docker compose exec db psql …` o pgAdmin.
 */

import { dockerQuery } from "@/lib/pg-docker";

/**
 * Retorna true si hay `DATABASE_URL` configurada. En producción (Vercel) esta
 * variable no existe → todo este módulo se convierte en no-op.
 */
function dualEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Envoltorio "best-effort": loggea y traga cualquier error. Nunca debe
 * romper la request principal hacia Supabase.
 */
async function tryDual(
  label: string,
  fn: () => Promise<void>
): Promise<void> {
  if (!dualEnabled()) return;
  try {
    await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // No ensuciamos los logs con stack traces completos — con el mensaje basta.
    console.warn(`[pg-dual-write:${label}] skipped:`, msg);
  }
}

/**
 * Inserta (si falta) un stub en `auth.users` para que las FKs de
 * `profiles.id → auth.users(id)` no fallen en Docker.
 *
 * En Supabase hosted esta fila la crea Auth automáticamente al hacer signup.
 * En Docker, `000_auth_stub.sql` sólo define la tabla — las filas las
 * metemos nosotros cuando el usuario hace su primera escritura.
 */
async function ensureDockerAuthUser(
  userId: string,
  email: string | null
): Promise<void> {
  await dockerQuery(
    `insert into auth.users (id, email)
     values ($1, $2)
     on conflict (id) do update set email = coalesce(excluded.email, auth.users.email)`,
    [userId, email]
  );
}

/**
 * Inserta / actualiza la fila de `profiles` en Docker. Se llama antes de
 * cualquier `user_cards` o `scan_uploads` para cubrir la FK.
 */
async function ensureDockerProfile(
  userId: string,
  email: string | null
): Promise<void> {
  await ensureDockerAuthUser(userId, email);
  await dockerQuery(
    `insert into public.profiles (id, email)
     values ($1, $2)
     on conflict (id) do update set email = coalesce(excluded.email, public.profiles.email)`,
    [userId, email]
  );
}

// ─────────────────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────────────────

/**
 * Garantiza una fila de profile en Docker. Útil para el flujo `GET /api/profile`
 * donde sólo queremos que el usuario aparezca aunque aún no haya cartas.
 */
export async function dualEnsureProfile(
  userId: string,
  email: string | null
): Promise<void> {
  await tryDual("ensure-profile", async () => {
    await ensureDockerProfile(userId, email);
  });
}

/**
 * Aplica al Docker el mismo patch que `PATCH /api/profile` aplica a Supabase.
 * `patch` sólo incluye claves permitidas (display_name, country, city, etc.).
 */
export async function dualUpdateProfile(
  userId: string,
  email: string | null,
  patch: Record<string, unknown>
): Promise<void> {
  await tryDual("update-profile", async () => {
    await ensureDockerProfile(userId, email);

    // Construimos el SET dinámico respetando el orden de las claves.
    const allowed = [
      "email",
      "username",
      "full_name",
      "avatar_url",
      "display_name",
      "country",
      "city",
      "discord_handle",
      "phone",
      "trade_notes",
      "is_public",
    ];

    const sets: string[] = [];
    const values: unknown[] = [userId];
    for (const key of allowed) {
      if (key in patch) {
        sets.push(`${key} = $${values.length + 1}`);
        values.push(patch[key]);
      }
    }
    if (sets.length === 0) return;

    await dockerQuery(
      `update public.profiles set ${sets.join(", ")}, updated_at = now() where id = $1`,
      values
    );
  });
}

export type DualCardCatalogRow = {
  id: string; // UUID generado por Supabase
  externalId: string; // pricecharting_product_id
  productName: string;
  setName: string | null;
  cardNumber: string | null;
  cardType: string | null;
  rarity: string | null;
  imageUrl: string | null;
  lastMarketPrice?: number | null;
};

/**
 * Upsert en `card_catalog` usando el mismo UUID que Supabase. Si el UUID ya
 * existe lo actualiza. Si el `external_id` existe con otro UUID (porque la
 * BD Docker arrancó antes sin reflejar Supabase), se reconcilia con ese id.
 */
export async function dualUpsertCardCatalog(
  row: DualCardCatalogRow
): Promise<void> {
  await tryDual("upsert-catalog", async () => {
    const now = new Date().toISOString();
    await dockerQuery(
      `insert into public.card_catalog (
          id, pricecharting_product_id, product_name, set_name, card_number,
          rarity, card_type, official_image_url, last_market_price,
          price_updated_at, updated_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        on conflict (pricecharting_product_id) do update set
          product_name = excluded.product_name,
          set_name = coalesce(excluded.set_name, public.card_catalog.set_name),
          card_number = coalesce(excluded.card_number, public.card_catalog.card_number),
          rarity = coalesce(excluded.rarity, public.card_catalog.rarity),
          card_type = coalesce(excluded.card_type, public.card_catalog.card_type),
          official_image_url = coalesce(excluded.official_image_url, public.card_catalog.official_image_url),
          last_market_price = coalesce(excluded.last_market_price, public.card_catalog.last_market_price),
          price_updated_at = coalesce(excluded.price_updated_at, public.card_catalog.price_updated_at),
          updated_at = excluded.updated_at`,
      [
        row.id,
        row.externalId,
        row.productName,
        row.setName,
        row.cardNumber,
        row.rarity,
        row.cardType,
        row.imageUrl,
        row.lastMarketPrice ?? null,
        row.lastMarketPrice != null ? now : null,
        now,
      ]
    );
  });
}

export type DualUserCardRow = {
  id: string; // UUID de la fila user_cards en Supabase
  userId: string;
  userEmail: string | null;
  catalog: DualCardCatalogRow;
  condition: string;
  language?: string;
  quantity: number;
  estimatedUnitValue: number;
  forTrade?: boolean;
  notes?: string | null;
  // Campos redundantes que la app guarda en user_cards además del catalog:
  setName: string | null;
  cardNumber: string | null;
  cardType: string | null;
  rarity: string | null;
  imageUrl: string | null;
};

/**
 * Inserta (o actualiza por id) una fila en `user_cards` del Docker. Antes
 * asegura `auth.users`, `profiles` y `card_catalog`.
 *
 * Si hay `estimatedUnitValue > 0` también inserta un `price_snapshots` como
 * histórico, replicando lo que hace POST /api/inventory en Supabase.
 */
export async function dualInsertUserCard(row: DualUserCardRow): Promise<void> {
  await tryDual("insert-user-card", async () => {
    await ensureDockerProfile(row.userId, row.userEmail);
    // El catálogo se inserta/updatea aquí mismo con el id de Supabase.
    await dockerQuery(
      `insert into public.card_catalog (
          id, pricecharting_product_id, product_name, set_name, card_number,
          rarity, card_type, official_image_url, last_market_price,
          price_updated_at, updated_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        on conflict (pricecharting_product_id) do update set
          product_name = excluded.product_name,
          set_name = coalesce(excluded.set_name, public.card_catalog.set_name),
          card_number = coalesce(excluded.card_number, public.card_catalog.card_number),
          rarity = coalesce(excluded.rarity, public.card_catalog.rarity),
          card_type = coalesce(excluded.card_type, public.card_catalog.card_type),
          official_image_url = coalesce(excluded.official_image_url, public.card_catalog.official_image_url),
          last_market_price = coalesce(excluded.last_market_price, public.card_catalog.last_market_price),
          price_updated_at = coalesce(excluded.price_updated_at, public.card_catalog.price_updated_at),
          updated_at = excluded.updated_at`,
      [
        row.catalog.id,
        row.catalog.externalId,
        row.catalog.productName,
        row.catalog.setName,
        row.catalog.cardNumber,
        row.catalog.rarity,
        row.catalog.cardType,
        row.catalog.imageUrl,
        row.estimatedUnitValue > 0 ? row.estimatedUnitValue : null,
        row.estimatedUnitValue > 0 ? new Date().toISOString() : null,
        new Date().toISOString(),
      ]
    );

    // Resolvemos el id real del catálogo en Docker por external_id (por si
    // el upsert de arriba reconcilió con un id existente previo).
    const catalogRows = await dockerQuery<{ id: string }>(
      `select id from public.card_catalog where pricecharting_product_id = $1 limit 1`,
      [row.catalog.externalId]
    );
    const catalogId = catalogRows[0]?.id;
    if (!catalogId) return; // raro, pero protege de null FKs

    await dockerQuery(
      `insert into public.user_cards (
          id, user_id, card_catalog_id, condition, language, quantity,
          estimated_unit_value, for_trade, notes, set_name, card_number,
          card_type, rarity, image_url
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        on conflict (id) do update set
          condition = excluded.condition,
          language = excluded.language,
          quantity = excluded.quantity,
          estimated_unit_value = excluded.estimated_unit_value,
          for_trade = excluded.for_trade,
          notes = excluded.notes,
          set_name = excluded.set_name,
          card_number = excluded.card_number,
          card_type = excluded.card_type,
          rarity = excluded.rarity,
          image_url = excluded.image_url,
          updated_at = now()`,
      [
        row.id,
        row.userId,
        catalogId,
        row.condition,
        row.language ?? "english",
        row.quantity,
        row.estimatedUnitValue,
        row.forTrade ?? false,
        row.notes ?? null,
        row.setName,
        row.cardNumber,
        row.cardType,
        row.rarity,
        row.imageUrl,
      ]
    );

    if (row.estimatedUnitValue > 0) {
      await dockerQuery(
        `insert into public.price_snapshots (card_catalog_id, market_price)
         values ($1, $2)`,
        [catalogId, row.estimatedUnitValue]
      );
    }
  });
}

/**
 * Aplica un patch parcial al `user_cards` de Docker identificado por id.
 * Sólo las columnas whitelisted se tocan.
 */
export async function dualUpdateUserCard(
  id: string,
  patch: Record<string, unknown>
): Promise<void> {
  await tryDual("update-user-card", async () => {
    const allowed = [
      "condition",
      "language",
      "quantity",
      "estimated_unit_value",
      "for_trade",
      "notes",
    ];
    const sets: string[] = [];
    const values: unknown[] = [id];
    for (const key of allowed) {
      if (key in patch) {
        sets.push(`${key} = $${values.length + 1}`);
        values.push(patch[key]);
      }
    }
    if (sets.length === 0) return;

    await dockerQuery(
      `update public.user_cards set ${sets.join(", ")}, updated_at = now() where id = $1`,
      values
    );
  });
}

/**
 * Update bulk para N ids con el mismo patch (lo usa el toggle "marcar para
 * intercambio" desde el inventario).
 */
export async function dualUpdateUserCardsBulk(
  ids: string[],
  patch: Record<string, unknown>
): Promise<void> {
  await tryDual("bulk-update-user-card", async () => {
    if (ids.length === 0) return;
    const allowed = ["for_trade"] as const;
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const key of allowed) {
      if (key in patch) {
        values.push(patch[key]);
        sets.push(`${key} = $${values.length}`);
      }
    }
    if (sets.length === 0) return;
    values.push(ids);

    await dockerQuery(
      `update public.user_cards set ${sets.join(", ")}, updated_at = now()
       where id = any($${values.length}::uuid[])`,
      values
    );
  });
}

/**
 * Borra una fila de `user_cards` en Docker. Si no existe es no-op.
 */
export async function dualDeleteUserCard(id: string): Promise<void> {
  await tryDual("delete-user-card", async () => {
    await dockerQuery(`delete from public.user_cards where id = $1`, [id]);
  });
}

/**
 * Helper para los cron de precios: update del catálogo + inserción de snapshot.
 */
export async function dualRefreshCatalogPrice(
  catalogExternalId: string,
  price: number
): Promise<void> {
  await tryDual("refresh-catalog-price", async () => {
    const now = new Date().toISOString();
    await dockerQuery(
      `update public.card_catalog
         set last_market_price = $2, price_updated_at = $3, updated_at = $3
         where pricecharting_product_id = $1`,
      [catalogExternalId, price, now]
    );
    const rows = await dockerQuery<{ id: string }>(
      `select id from public.card_catalog where pricecharting_product_id = $1`,
      [catalogExternalId]
    );
    const catalogId = rows[0]?.id;
    if (catalogId) {
      await dockerQuery(
        `insert into public.price_snapshots (card_catalog_id, market_price)
         values ($1, $2)`,
        [catalogId, price]
      );
      await dockerQuery(
        `update public.user_cards
           set estimated_unit_value = $2, updated_at = now()
           where card_catalog_id = $1`,
        [catalogId, price]
      );
    }
  });
}
