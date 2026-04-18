import { NextResponse } from "next/server";
import { getDockerPool, dockerQuery } from "@/lib/pg-docker";

/**
 * GET /api/docker-health
 *
 * Prueba de vida de la base de datos dockerizada. Se conecta por `pg`
 * (no por el SDK de Supabase) y devuelve:
 *   - Status (ok / error)
 *   - Host + database a los que se conectó
 *   - Versión de Postgres
 *   - Número de tablas y vistas en schema public
 *   - Filas por tabla: profiles, card_catalog, user_cards, community_cards
 *   - Latencia total del round trip en ms
 *
 * Esto demuestra visualmente, desde el navegador, que la app Next.js está
 * leyendo contra el Postgres del docker-compose y no contra Supabase hosted.
 *
 * Sin `DATABASE_URL` en .env.local el endpoint devuelve 500 con un mensaje
 * claro. Si el contenedor está apagado devuelve 503 con la causa.
 */
export const dynamic = "force-dynamic";

type TableCount = { name: string; kind: "table" | "view"; rows: number };

export async function GET() {
  const start = Date.now();

  // 1) Validación temprana de DATABASE_URL.
  const url = process.env.DATABASE_URL;
  if (!url) {
    return NextResponse.json(
      {
        status: "not_configured",
        error:
          "Falta DATABASE_URL en .env.local. Añade: DATABASE_URL=postgres://pokescan:pokescan_dev@localhost:5433/pokemoncardpokedex",
      },
      { status: 500 }
    );
  }

  // 2) Parseamos host/db para mostrarlo en UI sin exponer password.
  let displayUrl = url;
  try {
    const u = new URL(url);
    displayUrl = `${u.protocol}//${u.username}@${u.host}${u.pathname}`;
  } catch {
    /* url no parseable — mostrar tal cual */
  }

  try {
    // 3) Conexión básica + versión Postgres.
    const pool = getDockerPool();
    const client = await pool.connect();
    try {
      const version = await client.query<{ version: string }>(
        "select version()"
      );

      // 4) Conteo de objetos en schema public.
      const objects = await client.query<{
        name: string;
        kind: "BASE TABLE" | "VIEW";
      }>(
        `
        select table_name as name, table_type as kind
        from information_schema.tables
        where table_schema = 'public'
        order by table_type desc, table_name asc
        `
      );

      // 5) Conteo de filas de las tablas clave. Las hacemos en paralelo.
      const CORE_TABLES = [
        "profiles",
        "card_catalog",
        "user_cards",
        "scan_uploads",
        "price_snapshots",
        "otp_audit",
      ];
      const CORE_VIEWS = [
        "community_profiles",
        "community_cards",
        "user_cards_detailed",
        "inventory_valuation_summary",
      ];

      const countsArr = await Promise.all(
        [...CORE_TABLES, ...CORE_VIEWS].map(async (name) => {
          // Escapamos sólo con allowlist: estos nombres son constantes
          // hard-coded, no input de usuario.
          try {
            const res = await client.query<{ count: string }>(
              `select count(*)::text as count from public.${name}`
            );
            return {
              name,
              kind: CORE_VIEWS.includes(name)
                ? "view"
                : ("table" as "table" | "view"),
              rows: Number(res.rows[0]?.count ?? 0),
            } as TableCount;
          } catch {
            // Si la tabla/vista no existe (ej. migración 008 no aplicada),
            // devolvemos rows: -1 para diferenciar de 0.
            return {
              name,
              kind: CORE_VIEWS.includes(name)
                ? "view"
                : ("table" as "table" | "view"),
              rows: -1,
            } as TableCount;
          }
        })
      );

      type ObjectRow = { name: string; kind: "BASE TABLE" | "VIEW" };
      const rows = objects.rows as ObjectRow[];
      return NextResponse.json({
        status: "ok",
        connection: displayUrl,
        postgresVersion: version.rows[0]?.version ?? "unknown",
        schemaSummary: {
          tables: rows.filter((o: ObjectRow) => o.kind === "BASE TABLE").length,
          views: rows.filter((o: ObjectRow) => o.kind === "VIEW").length,
        },
        objects: rows.map((r: ObjectRow) => ({
          name: r.name,
          kind: r.kind === "VIEW" ? "view" : "table",
        })),
        counts: countsArr,
        latencyMs: Date.now() - start,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // Códigos típicos: ECONNREFUSED (contenedor apagado), ENOTFOUND (host
    // mal escrito), 28P01 (password incorrecta), 3D000 (base inexistente).
    const isRefused = msg.includes("ECONNREFUSED");
    return NextResponse.json(
      {
        status: isRefused ? "db_unreachable" : "error",
        connection: displayUrl,
        error: msg,
        hint: isRefused
          ? "El contenedor parece apagado. Ejecuta: `docker compose up -d` en pokemon-card-pokedex/"
          : undefined,
        latencyMs: Date.now() - start,
      },
      { status: 503 }
    );
  }
}

/**
 * Warmup opcional — no se exporta porque Next.js App Router sólo acepta
 * exports conocidos (GET/POST/etc.) en archivos de ruta. Se deja como
 * función privada para poder llamarlo desde un script futuro si hiciera
 * falta pre-calentar el pool en un cron.
 */
async function _warmup() {
  try {
    await dockerQuery("select 1");
  } catch {
    /* noop */
  }
}
void _warmup;
