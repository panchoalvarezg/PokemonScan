"use client";

import { useEffect, useState } from "react";

type TopCard = {
  rank: number;
  externalId: string;
  name: string;
  set: string;
  cardNumber: string;
  rarity: string;
  type: string;
  imageUrl: string | null;
  price: number;
};

type Response = {
  count: number;
  cards: TopCard[];
};

function formatUSD(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export function TopExpensiveCards() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/top-cards?limit=10", {
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
          "linear-gradient(180deg, rgba(244,225,74,0.10) 0%, rgba(255,255,255,1) 60%)",
      }}
    >
      <header style={{ marginBottom: "1rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.4rem" }}>
          💰 Top 10 — Cartas Pokémon más caras
        </h2>
        <p className="small" style={{ margin: "0.25rem 0 0", color: "var(--muted)" }}>
          Ranking en tiempo real según Pokemon Price Tracker. Precios en USD,
          actualizados cada 10 minutos.
        </p>
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
      ) : !data || data.cards.length === 0 ? (
        <div className="notice" style={{ padding: "1rem" }}>
          No se pudo obtener el ranking desde la API. Verifica que la variable
          <code> POKEMON_PRICE_TRACKER_API_KEY </code> esté configurada en
          Vercel.
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
          {data.cards.map((c) => (
            <li
              key={`${c.rank}-${c.externalId}`}
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
                {c.rank}
              </div>

              {c.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.imageUrl}
                  alt={c.name}
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
                  {c.name}
                </div>
                <div
                  className="small"
                  style={{
                    color: "var(--muted)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {[c.set, c.cardNumber && `#${c.cardNumber}`, c.rarity]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>

              <div
                style={{
                  textAlign: "right",
                  minWidth: 110,
                  fontWeight: 800,
                  color: "#15803d",
                  fontSize: "1.05rem",
                }}
              >
                {formatUSD(c.price)}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
