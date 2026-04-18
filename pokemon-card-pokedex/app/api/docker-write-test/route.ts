import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getDockerPool } from "@/lib/pg-docker";

/**
 * GET /api/docker-write-test
 *
 * Diagnóstico end-to-end del dual-write.
 *
 * Ejecuta, contra el Postgres dockerizado, la misma cascada que hace
 * `POST /api/inventory` pero con datos dummy:
 *
 *   1. Inserta un usuario de prueba en `auth.users`.
 *   2. Inserta un perfil en `public.profiles`.
 *   3. Inserta una carta en `public.card_catalog`.
 *   4. Inserta una fila en `public.user_cards`.
 *   5. Inserta un snapshot de precio en `public.price_snapshots`.
 *   6. Lee de vuelta todas las filas para confirmar que existen.
 *   7. Limpia todo (delete cascade) para no ensuciar la BD.
 *
 * Si cualquier paso falla, devuelve `{ ok: false, failedStep, error, code,
 * detail }`. Si todos pasan, devuelve `{ ok: true, steps: [...] }`.
 *
 * Útil cuando `/docker-status` muestra "Conectado" pero los conteos no
 * suben al usar la app real — este endpoint aísla si el problema está en
 * la red, en el schema o en algo más alto en las rutas API.
 */
export const dynamic = "force-dynamic";

type StepResult = {
  step: string;
  sql: string;
  rowsAffected?: number;
  rowsReturned?: number;
};

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        ok: false,
        failedStep: "env",
        error:
          "DATABASE_URL no está definida. Añadela a .env.local y reiniciá `npm run dev`.",
      },
      { status: 500 }
    );
  }

  const pool = getDockerPool();
  const steps: StepResult[] = [];

  // Generamos UUIDs deterministas con prefijo conocido para poder
  // distinguirlos en pgAdmin y limpiar al final.
  const testUserId = randomUUID();
  const testCatalogId = randomUUID();
  const testUserCardId = randomUUID();
  const externalId = `dual-write-test-${Date.now()}`;
  const email = `dualtest-${testUserId.slice(0, 8)}@pokescan.test`;

  const client = await pool.connect().catch((err) => {
    throw new Error(
      `No se pudo conectar al Docker: ${err instanceof Error ? err.message : String(err)}`
    );
  });

  try {
    // Paso 1 — auth.users
    try {
      const r = await client.query(
        `insert into auth.users (id, email) values ($1, $2)
         on conflict (id) do nothing`,
        [testUserId, email]
      );
      steps.push({
        step: "1. insert auth.users",
        sql: "insert into auth.users ...",
        rowsAffected: r.rowCount ?? 0,
      });
    } catch (err) {
      return fail("1. insert auth.users", err, steps);
    }

    // Paso 2 — public.profiles
    try {
      const r = await client.query(
        `insert into public.profiles (id, email) values ($1, $2)
         on conflict (id) do nothing`,
        [testUserId, email]
      );
      steps.push({
        step: "2. insert public.profiles",
        sql: "insert into public.profiles ...",
        rowsAffected: r.rowCount ?? 0,
      });
    } catch (err) {
      return fail("2. insert public.profiles", err, steps);
    }

    // Paso 3 — public.card_catalog
    try {
      const r = await client.query(
        `insert into public.card_catalog (
            id, pricecharting_product_id, product_name, set_name, card_number,
            rarity, card_type, official_image_url, last_market_price, price_updated_at
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
          on conflict (pricecharting_product_id) do nothing`,
        [
          testCatalogId,
          externalId,
          "Carta de prueba",
          "Test Set",
          "0/0",
          "Test Rare",
          "Fire",
          null,
          99.99,
        ]
      );
      steps.push({
        step: "3. insert public.card_catalog",
        sql: "insert into public.card_catalog ...",
        rowsAffected: r.rowCount ?? 0,
      });
    } catch (err) {
      return fail("3. insert public.card_catalog", err, steps);
    }

    // Paso 4 — public.user_cards
    try {
      const r = await client.query(
        `insert into public.user_cards (
            id, user_id, card_catalog_id, condition, language, quantity,
            estimated_unit_value, for_trade, set_name, card_number, card_type,
            rarity, image_url
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          on conflict (id) do nothing`,
        [
          testUserCardId,
          testUserId,
          testCatalogId,
          "near_mint",
          "english",
          1,
          99.99,
          true,
          "Test Set",
          "0/0",
          "Fire",
          "Test Rare",
          null,
        ]
      );
      steps.push({
        step: "4. insert public.user_cards",
        sql: "insert into public.user_cards ...",
        rowsAffected: r.rowCount ?? 0,
      });
    } catch (err) {
      return fail("4. insert public.user_cards", err, steps);
    }

    // Paso 5 — public.price_snapshots
    try {
      const r = await client.query(
        `insert into public.price_snapshots (card_catalog_id, market_price)
         values ($1, $2)`,
        [testCatalogId, 99.99]
      );
      steps.push({
        step: "5. insert public.price_snapshots",
        sql: "insert into public.price_snapshots ...",
        rowsAffected: r.rowCount ?? 0,
      });
    } catch (err) {
      return fail("5. insert public.price_snapshots", err, steps);
    }

    // Paso 6 — readback por user_cards_detailed (vista enriquecida)
    try {
      const r = await client.query(
        `select id, product_name, set_name, rarity, card_type, estimated_unit_value, for_trade
         from public.user_cards_detailed where id = $1`,
        [testUserCardId]
      );
      steps.push({
        step: "6. select public.user_cards_detailed",
        sql: "select ... from public.user_cards_detailed ...",
        rowsReturned: r.rowCount ?? 0,
      });
      if (r.rowCount === 0) {
        return NextResponse.json(
          {
            ok: false,
            failedStep: "6. readback",
            error:
              "La vista user_cards_detailed no devolvió la fila insertada. ¿Migración 007 aplicada?",
            steps,
          },
          { status: 500 }
        );
      }
    } catch (err) {
      return fail("6. select user_cards_detailed", err, steps);
    }

    // Paso 7 — cleanup. auth.users tiene ON DELETE CASCADE hacia profiles,
    // y profiles→user_cards también, así que borrando auth.users cae todo.
    try {
      const r = await client.query(
        `delete from auth.users where id = $1`,
        [testUserId]
      );
      // price_snapshots tiene FK a card_catalog con CASCADE, pero borramos
      // también el catálogo aparte para dejar todo limpio.
      await client.query(
        `delete from public.card_catalog where id = $1`,
        [testCatalogId]
      );
      steps.push({
        step: "7. cleanup",
        sql: "delete from auth.users ... + delete from public.card_catalog ...",
        rowsAffected: r.rowCount ?? 0,
      });
    } catch (err) {
      return fail("7. cleanup", err, steps);
    }

    return NextResponse.json({
      ok: true,
      message:
        "Dual-write verificado end-to-end. El pipeline insert/read/delete funciona contra el Docker.",
      steps,
    });
  } finally {
    client.release();
  }
}

function fail(step: string, err: unknown, steps: StepResult[]) {
  const msg = err instanceof Error ? err.message : String(err);
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: unknown }).code)
      : undefined;
  const detail =
    err && typeof err === "object" && "detail" in err
      ? String((err as { detail?: unknown }).detail)
      : undefined;
  const hint =
    err && typeof err === "object" && "hint" in err
      ? String((err as { hint?: unknown }).hint)
      : undefined;
  return NextResponse.json(
    {
      ok: false,
      failedStep: step,
      error: msg,
      code,
      detail,
      hint,
      steps,
    },
    { status: 500 }
  );
}
