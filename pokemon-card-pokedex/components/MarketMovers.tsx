"use client";

import { useEffect, useState } from "react";

type Mover = {
  rank: number;
  externalId: string;
  name: string;
  set: string;
  cardNumber: string;
  rarity: string;
  type: string;
  imageUrl: string | null;
  currentPrice: number;
  previousPrice: number | null;
  percentChange: number;
  absoluteChange: number;
  direction: "up" | "down";
};

type Response = {
  source: "api" | "snapshots" | "empty";
  movers: Mover[];
};

function formatUSD(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: number) {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function MarketMovers() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/market-movers?limit=10", {
          cache: "no-store",
        });
        const body = (await res.json()) as Response | { error: string };
        if (cancelled) return;
        if (!res.ok || "error" in body) {
          setError(("error" in body && body.error) || "No se pudo cargar.");
          setLoading(false);
          return;
        }
        setData(body);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Error de red.");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      className="card"
      style={{
        padding: "1.5rem",
        background:
          "linear-gradient(180deg, rgba(17,24,39,0.04) 0%, rgba(255,255,255,1) 60%)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
          marginBottom: "1rem",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: "1.4rem" }}>
            📈 Top 10 — Movimientos de mercado 24h
          </h2>
          <p className="small" style={{ margin: "0.25rem 0 0", color: "var(--muted)" }}>
            Cartas Pokémon con la mayor variación de precio en las últimas 24
            horas (datos de Pokemon Price Tracker).
          </p>
        </div>
        {data?.source ? (
          <span
            className="small"
            style={{
              background:
                data.source === "api"
                  ? "#dcfce7"
                  : data.source === "snapshots"
                    ? "#fef3c7"
                    : "#f3f4f6",
              color: "#1f2937",
              padding: "0.15rem 0.55rem",
              borderRadius: 999,
              border: "1px solid rgba(0,0,0,0.08)",
              whiteSpace: "nowrap",
            }}
            title={
              data.source === "api"
                ? "Datos en vivo de la API"
                : data.source === "snapshots"
                  ? "Calculado con tus snapshots locales"
                  : "Sin datos aún"
            }
          >
            {data.source === "api"
              ? "Live"
              : data.source === "snapshots"
                ? "Interno"
                : "Sin datos"}
          </span>
        ) : null}
      </header>

      {loading ? (
        <div
          className="small"
          style={{ color: "var(--muted)", padding: "1rem 0" }}
        >
          Cargando ranking…
        </div>
      ) : error ? (
        <div className="error">Error: {error}</div>
      ) : !data || data.movers.length === 0 ? (
        <div className="notice" style={{ padding: "1rem" }}>
          Todavía no hay movimientos disponibles. El ranking se llenará cuando
          la API externa exponga el período 24h o cuando acumules varios
          snapshots de precio (cron diario de Vercel).
        </div>
      ) : (
        <ol
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            gap: "0.6rem",
          }}
        >
          {data.movers.map((m) => (
            <li
              key={`${m.rank}-${m.externalId}`}
              style={{
                display: "grid",
                gridTemplateColumns: "36px 56px 1fr auto",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.6rem 0.75rem",
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "#fff",
              }}
            >
              <div
                style={{
                  fontWeight: 800,
                  fontSize: "1.1rem",
                  color: "#1f2937",
                  textAlign: "center",
                  background: "#f4e14a",
                  borderRadius: 8,
                  padding: "0.2rem 0",
                  border: "2px solid #111",
                  lineHeight: 1,
                }}
              >
                {m.rank}
              </div>

              {m.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.imageUrl}
                  alt={m.name}
                  width={52}
                  height={72}
                  style={{
                    width: 52,
                    height: 72,
                    objectFit: "cover",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                  }}
                />
              ) : (
                <div
                  aria-hidden
                  style={{
                    width: 52,
                    height: 72,
                    borderRadius: 6,
                    background: "#f3f4f6",
                    border: "1px dashed var(--border)",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 22,
                    color: "#9ca3af",
                  }}
                >
                  ?
                </div>
              )}

              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {m.name}
                </div>
                <div
                  className="small"
                  style={{ color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                >
                  {[m.set, m.cardNumber && `#${m.cardNumber}`, m.rarity]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>

              <div
                style={{
                  textAlign: "right",
                  display: "grid",
                  gap: 2,
                  minWidth: 110,
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    color: m.direction === "up" ? "#15803d" : "#b91c1c",
                  }}
                >
                  {m.direction === "up" ? "▲" : "▼"} {formatPercent(m.percentChange)}
                </div>
                <div className="small" style={{ color: "#374151" }}>
                  {formatUSD(m.currentPrice)}
                </div>
                {m.previousPrice != null ? (
                  <div
                    className="small"
                    style={{ color: "var(--muted)", fontSize: "0.75rem" }}
                  >
                    antes {formatUSD(m.previousPrice)}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
