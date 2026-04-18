"use client";

import { useCallback, useEffect, useState } from "react";

type TableCount = {
  name: string;
  kind: "table" | "view";
  rows: number;
};

type OkResponse = {
  status: "ok";
  connection: string;
  postgresVersion: string;
  schemaSummary: { tables: number; views: number };
  objects: { name: string; kind: "table" | "view" }[];
  counts: TableCount[];
  latencyMs: number;
};

type ErrResponse = {
  status: "error" | "db_unreachable" | "not_configured";
  connection?: string;
  error: string;
  hint?: string;
  latencyMs?: number;
};

type Response = OkResponse | ErrResponse;

function StatusBadge({ status }: { status: Response["status"] }) {
  const map: Record<Response["status"], { bg: string; fg: string; label: string }> = {
    ok: { bg: "#dcfce7", fg: "#15803d", label: "Conectado" },
    error: { bg: "#fee2e2", fg: "#b91c1c", label: "Error" },
    db_unreachable: { bg: "#fef3c7", fg: "#b45309", label: "BD apagada" },
    not_configured: { bg: "#e5e7eb", fg: "#374151", label: "No configurado" },
  };
  const s = map[status];
  return (
    <span
      style={{
        background: s.bg,
        color: s.fg,
        padding: "4px 10px",
        borderRadius: 999,
        fontWeight: 700,
        fontSize: "0.85rem",
        border: `1px solid ${s.fg}`,
      }}
    >
      ● {s.label}
    </span>
  );
}

type WriteTestStep = {
  step: string;
  sql: string;
  rowsAffected?: number;
  rowsReturned?: number;
};

type WriteTestResponse =
  | { ok: true; message: string; steps: WriteTestStep[] }
  | {
      ok: false;
      failedStep: string;
      error: string;
      code?: string;
      detail?: string;
      hint?: string;
      steps?: WriteTestStep[];
    };

export function DockerStatusClient() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshCount, setRefreshCount] = useState(0);
  const [writeTest, setWriteTest] = useState<WriteTestResponse | null>(null);
  const [writeTestLoading, setWriteTestLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/docker-health", { cache: "no-store" });
      const body = (await res.json()) as Response;
      setData(body);
    } catch (err) {
      setData({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const runWriteTest = useCallback(async () => {
    setWriteTestLoading(true);
    setWriteTest(null);
    try {
      const res = await fetch("/api/docker-write-test", { cache: "no-store" });
      const body = (await res.json()) as WriteTestResponse;
      setWriteTest(body);
      // Refrescamos counts después del test (aunque limpie al final, el
      // badge de latencia puede cambiar).
      setRefreshCount((n) => n + 1);
    } catch (err) {
      setWriteTest({
        ok: false,
        failedStep: "network",
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setWriteTestLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshCount]);

  if (loading && !data) {
    return (
      <div className="card">
        <p className="small">Consultando la BD dockerizada…</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <>
      <section className="card" style={{ padding: "1.25rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <StatusBadge status={data.status} />
            {"latencyMs" in data && typeof data.latencyMs === "number" && (
              <span className="small" style={{ color: "var(--muted)" }}>
                {data.latencyMs} ms
              </span>
            )}
          </div>
          <button
            className="button secondary"
            onClick={() => setRefreshCount((n) => n + 1)}
            disabled={loading}
          >
            {loading ? "Consultando…" : "↻ Refrescar"}
          </button>
        </div>

        {data.status === "ok" ? (
          <>
            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "150px 1fr",
                gap: "6px 12px",
                margin: "1rem 0 0",
              }}
            >
              <dt className="small" style={{ color: "var(--muted)" }}>
                Conexión
              </dt>
              <dd style={{ margin: 0, fontFamily: "monospace" }}>
                {data.connection}
              </dd>

              <dt className="small" style={{ color: "var(--muted)" }}>
                Postgres
              </dt>
              <dd
                style={{
                  margin: 0,
                  fontFamily: "monospace",
                  fontSize: "0.85rem",
                  wordBreak: "break-word",
                }}
              >
                {data.postgresVersion}
              </dd>

              <dt className="small" style={{ color: "var(--muted)" }}>
                Objetos
              </dt>
              <dd style={{ margin: 0 }}>
                <strong>{data.schemaSummary.tables}</strong> tablas ·{" "}
                <strong>{data.schemaSummary.views}</strong> vistas en{" "}
                <code>public</code>
              </dd>
            </dl>
          </>
        ) : (
          <div
            className="error"
            style={{ marginTop: "1rem", fontFamily: "monospace", fontSize: "0.85rem" }}
          >
            {data.error}
            {data.hint && (
              <p style={{ marginTop: 8, fontFamily: "inherit", fontSize: "0.9rem" }}>
                💡 {data.hint}
              </p>
            )}
          </div>
        )}
      </section>

      {data.status === "ok" && (
        <section className="card" style={{ marginTop: 16 }}>
          <h2 style={{ margin: 0 }}>Conteo por objeto</h2>
          <p className="small" style={{ color: "var(--muted)", marginTop: 4 }}>
            Filas presentes en cada tabla y vista del proyecto. Si ves{" "}
            <code>—</code> significa que la migración correspondiente aún no se
            aplicó en este contenedor.
          </p>

          <table
            style={{
              width: "100%",
              marginTop: "1rem",
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid var(--border)" }}>
                <th style={{ padding: "8px 6px" }}>Objeto</th>
                <th style={{ padding: "8px 6px" }}>Tipo</th>
                <th style={{ padding: "8px 6px", textAlign: "right" }}>Filas</th>
              </tr>
            </thead>
            <tbody>
              {data.counts.map((c) => (
                <tr
                  key={c.name}
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <td style={{ padding: "8px 6px", fontFamily: "monospace" }}>
                    {c.name}
                  </td>
                  <td style={{ padding: "8px 6px" }}>
                    <span
                      className="small"
                      style={{
                        padding: "2px 8px",
                        borderRadius: 6,
                        background:
                          c.kind === "view" ? "#eef2ff" : "#fef9c3",
                        color: c.kind === "view" ? "#4338ca" : "#854d0e",
                        fontWeight: 600,
                      }}
                    >
                      {c.kind}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "8px 6px",
                      textAlign: "right",
                      fontFamily: "monospace",
                      fontWeight: 700,
                    }}
                  >
                    {c.rows < 0 ? "—" : c.rows.toLocaleString("es-CL")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {data.status === "ok" && (
        <section className="card" style={{ marginTop: 16, padding: "1rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h3 style={{ margin: 0 }}>Diagnóstico de dual-write</h3>
              <p className="small" style={{ margin: "4px 0 0", color: "var(--muted)" }}>
                Ejecuta un insert → read → delete contra el Docker para aislar
                si el dual-write de la app tiene un problema (schema, FK,
                permisos…). No deja datos residuales.
              </p>
            </div>
            <button
              className="button"
              onClick={runWriteTest}
              disabled={writeTestLoading}
            >
              {writeTestLoading ? "Probando…" : "Probar escritura"}
            </button>
          </div>

          {writeTest && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 8,
                background: writeTest.ok ? "#dcfce7" : "#fee2e2",
                color: writeTest.ok ? "#15803d" : "#991b1b",
                fontFamily: "monospace",
                fontSize: "0.85rem",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                {writeTest.ok ? "✅ OK" : `❌ Falló en: ${writeTest.failedStep}`}
              </div>
              {writeTest.ok ? (
                <>
                  <div>{writeTest.message}</div>
                  {writeTest.steps.length > 0 && (
                    <ul style={{ margin: "6px 0 0 1rem", padding: 0 }}>
                      {writeTest.steps.map((s, i) => (
                        <li key={i}>
                          {s.step}
                          {s.rowsAffected !== undefined
                            ? ` → rowsAffected=${s.rowsAffected}`
                            : ""}
                          {s.rowsReturned !== undefined
                            ? ` → rowsReturned=${s.rowsReturned}`
                            : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <strong>error:</strong> {writeTest.error}
                  </div>
                  {writeTest.code && (
                    <div>
                      <strong>code:</strong> {writeTest.code}
                    </div>
                  )}
                  {writeTest.detail && (
                    <div>
                      <strong>detail:</strong> {writeTest.detail}
                    </div>
                  )}
                  {writeTest.hint && (
                    <div>
                      <strong>hint:</strong> {writeTest.hint}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      )}

      <section className="card" style={{ marginTop: 16, padding: "1rem" }}>
        <h3 style={{ margin: 0 }}>Cómo probarlo paso a paso</h3>
        <ol className="small" style={{ margin: "0.5rem 0 0 1rem" }}>
          <li>
            En <code>pokemon-card-pokedex/</code> ejecuta{" "}
            <code>docker compose up -d</code>.
          </li>
          <li>
            Añade a <code>.env.local</code>:{" "}
            <code>
              DATABASE_URL=postgres://pokescan:pokescan_dev@localhost:5433/pokemoncardpokedex
            </code>
          </li>
          <li>
            Reinicia <code>npm run dev</code> para que Next cargue la variable.
          </li>
          <li>
            Abre esta página — deberías ver badge <strong>Conectado</strong> y
            los conteos de filas.
          </li>
          <li>
            Pulsa <strong>Probar escritura</strong>. Si marca ✅ OK, el
            dual-write funciona y el problema es otro (dev server sin
            reiniciar, código antiguo cacheado). Si falla, el mensaje indica
            exactamente qué paso/schema/FK está mal.
          </li>
          <li>
            Tras confirmar ✅ OK, añade/edita cartas en la app real y vuelve a
            refrescar <code>/docker-status</code>: los conteos deben subir.
          </li>
        </ol>
      </section>
    </>
  );
}
