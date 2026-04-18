"use client";

import { useEffect, useState } from "react";
import { currency } from "@/lib/utils";

type CommunityCard = {
  id: string;
  productName: string;
  setName: string | null;
  cardNumber: string | null;
  cardType: string | null;
  rarity: string | null;
  imageUrl: string | null;
  condition: string | null;
  language: string | null;
  quantity: number;
  unitValue: number;
  notes: string | null;
  createdAt: string | null;
};

type CommunityProfile = {
  id: string;
  handle: string;
  displayName: string | null;
  country: string | null;
  city: string | null;
  discord: string | null;
  tradeNotes: string | null;
  avatarUrl: string | null;
  updatedAt: string | null;
};

type Response =
  | {
      profile: CommunityProfile;
      cards: CommunityCard[];
      totals: { distinct: number; cards: number; value: number };
    }
  | { error: string };

function locationOf(p: CommunityProfile) {
  const bits = [p.city, p.country].filter((x): x is string => !!x && x.trim().length > 0);
  return bits.length > 0 ? bits.join(", ") : "Ubicación no indicada";
}

export function CommunityProfileClient({ handle }: { handle: string }) {
  const [data, setData] = useState<Exclude<Response, { error: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/community/${encodeURIComponent(handle)}`, {
          cache: "no-store",
        });
        const body = (await res.json()) as Response;
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
  }, [handle]);

  if (loading) {
    return <div className="small" style={{ color: "var(--muted)" }}>Cargando perfil…</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (!data) {
    return <div className="notice">Perfil no encontrado.</div>;
  }

  const { profile, cards, totals } = data;

  return (
    <>
      <section
        className="card"
        style={{
          padding: "1.5rem",
          display: "flex",
          gap: 16,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatarUrl}
            alt={profile.handle}
            width={72}
            height={72}
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              objectFit: "cover",
              border: "3px solid var(--pk-red)",
            }}
          />
        ) : (
          <div
            aria-hidden
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: "#f4e14a",
              border: "3px solid #111",
              display: "grid",
              placeItems: "center",
              fontWeight: 800,
              color: "#111",
              fontSize: 28,
            }}
          >
            {profile.handle.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: "1.8rem" }}>@{profile.handle}</h1>
          {profile.displayName && (
            <p className="small" style={{ margin: "2px 0 0", color: "var(--muted)" }}>
              {profile.displayName}
            </p>
          )}
          <p className="small" style={{ margin: "6px 0 0" }}>
            📍 {locationOf(profile)}
          </p>
          {profile.discord && (
            <p className="small" style={{ margin: "2px 0 0" }}>
              💬 {profile.discord}
            </p>
          )}
        </div>
        <div style={{ textAlign: "right", minWidth: 140 }}>
          <div className="small">
            <strong>{totals.cards}</strong> cartas ·{" "}
            <strong>{totals.distinct}</strong> únicas
          </div>
          <div style={{ fontWeight: 800, color: "#15803d", fontSize: "1.1rem" }}>
            {currency(totals.value)}
          </div>
        </div>
      </section>

      {profile.tradeNotes && (
        <section className="card" style={{ marginTop: 16, padding: "1rem" }}>
          <h3 style={{ margin: 0 }}>Notas de intercambio</h3>
          <p className="small" style={{ whiteSpace: "pre-line", marginTop: 6 }}>
            {profile.tradeNotes}
          </p>
        </section>
      )}

      <h2 style={{ marginTop: 24 }}>Cartas disponibles para intercambio</h2>

      {cards.length === 0 ? (
        <p className="small">Este usuario aún no tiene cartas marcadas para intercambio.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gap: "0.8rem",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            marginTop: 12,
          }}
        >
          {cards.map((c) => (
            <article
              key={c.id}
              className="card"
              style={{
                padding: "0.75rem",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {c.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.imageUrl}
                  alt={c.productName}
                  style={{
                    width: "100%",
                    aspectRatio: "3/4",
                    objectFit: "cover",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                  }}
                />
              ) : (
                <div
                  aria-hidden
                  style={{
                    width: "100%",
                    aspectRatio: "3/4",
                    background: "#f3f4f6",
                    border: "1px dashed var(--border)",
                    borderRadius: 8,
                    display: "grid",
                    placeItems: "center",
                    color: "#9ca3af",
                    fontSize: 32,
                  }}
                >
                  ?
                </div>
              )}

              <div>
                <div style={{ fontWeight: 700, lineHeight: 1.2 }}>
                  {c.productName}
                </div>
                <div className="small" style={{ color: "var(--muted)" }}>
                  {[c.setName, c.cardNumber && `#${c.cardNumber}`, c.rarity]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                {c.cardType && (
                  <div className="small" style={{ color: "var(--muted)" }}>
                    Tipo: {c.cardType}
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderTop: "1px solid var(--border)",
                  paddingTop: 6,
                }}
              >
                <span className="small">
                  {c.quantity > 1 ? `x${c.quantity} · ` : ""}
                  {c.condition ?? ""}
                </span>
                <span style={{ fontWeight: 800, color: "#15803d" }}>
                  {currency(c.unitValue)}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
