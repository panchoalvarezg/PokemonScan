import { Pool } from "pg";

/**
 * Pool de conexiones directas al Postgres dockerizado (docker-compose).
 *
 * IMPORTANTE: este módulo NO reemplaza al cliente Supabase. La app normal
 * sigue usando `lib/supabase/*` para hablar con Supabase hosted. Este pool
 * sirve exclusivamente para:
 *
 *   1. El endpoint `/api/docker-health`, que demuestra en vivo que la app
 *      Next.js puede conectarse y leer del contenedor Postgres local.
 *   2. Scripts de admin/tests que quieran bypass del REST de Supabase.
 *
 * Variable de entorno esperada:
 *   DATABASE_URL=postgres://pokescan:pokescan_dev@localhost:5433/pokemoncardpokedex
 *
 * Usamos un singleton global (vía globalThis) para que Next.js en dev mode,
 * con su hot-reload, no abra decenas de pools por cada recarga.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalForPg = globalThis as unknown as { __dockerPgPool?: Pool };

export function getDockerPool(): Pool {
  if (!globalForPg.__dockerPgPool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL no está definida. Añádela a .env.local:\n" +
          "  DATABASE_URL=postgres://pokescan:pokescan_dev@localhost:5433/pokemoncardpokedex"
      );
    }

    globalForPg.__dockerPgPool = new Pool({
      connectionString: url,
      // Timeouts cortos para que la UI reaccione rápido si el contenedor
      // Docker está apagado (evita que /docker-status quede 30s colgado).
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 10_000,
      max: 5,
    });

    // Evitamos que un error no capturado del pool tumbe el proceso Next
    // en dev. Loguear y seguir.
    globalForPg.__dockerPgPool.on("error", (err) => {
      console.warn("[pg-docker] pool error:", err.message);
    });
  }

  return globalForPg.__dockerPgPool;
}

/**
 * Helper de conveniencia: ejecuta una query y libera la conexión.
 */
export async function dockerQuery<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const pool = getDockerPool();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await pool.query<any>(sql, params);
  return result.rows as T[];
}
