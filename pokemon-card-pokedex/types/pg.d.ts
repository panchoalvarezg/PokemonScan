// Shim mínimo de tipos para `pg` (node-postgres).
//
// Solo está aquí para que `tsc --noEmit` no falle cuando alguien ejecuta
// el typecheck ANTES de haber hecho `npm install` — momento en el que
// los tipos reales de `@types/pg` aún no están en node_modules.
//
// Una vez instalado `@types/pg`, sus tipos reales toman precedencia
// (skipLibCheck + declaration merging), y este archivo se queda como
// fallback inofensivo.

declare module "pg" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type QueryResultRow = Record<string, any>;

  export interface QueryResult<R extends QueryResultRow = QueryResultRow> {
    rows: R[];
    rowCount: number | null;
  }

  export interface PoolConfig {
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    max?: number;
    min?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
    ssl?: boolean | { rejectUnauthorized?: boolean };
  }

  export interface PoolClient {
    query<R extends QueryResultRow = QueryResultRow>(
      sql: string,
      params?: unknown[]
    ): Promise<QueryResult<R>>;
    release(): void;
  }

  export class Pool {
    constructor(config?: PoolConfig);
    connect(): Promise<PoolClient>;
    query<R extends QueryResultRow = QueryResultRow>(
      sql: string,
      params?: unknown[]
    ): Promise<QueryResult<R>>;
    on(event: "error", listener: (err: Error) => void): this;
    end(): Promise<void>;
  }

  export default Pool;
}
