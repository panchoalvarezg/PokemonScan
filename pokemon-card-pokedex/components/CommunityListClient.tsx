"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { currency } from "@/lib/utils";

type CommunityProfile = {
  id: string;
  handle: string;
  displayName: string | null;
  country: string | null;
  city: string | null;
  discord: string | null;
  tradeNotes: string | null;
  avatarUrl: string | null;
  cardCount: number;
  totalValue: number;
  previews: string[];
};

type Response =
  | { count: number; profiles: CommunityProfile[] }
  | { error: string };

function locationOf(p: CommunityProfile) {
  const bits = [p.city, p.country].filter((x): x is string => !!x && x.trim().length > 0);
  return bits.length > 0 ? bits.join(", ") : "Ubicación no indicada";
}

export function CommunityListClient() {
  const [data, setData] = useState<CommunityProfile[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/community", { cache: "no-store" });
        const body = (await res.json()) as Response;
        if (cancelled) return;
        if (!res.ok || "error" in body) {
          setError(("error" in body && body.error) || "No se pudo cargar.");
          setLoading(false);
          return;
        }
        setData(body.profiles);
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

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter((p) => {
      const haystack = [
        p.handle,
        p.displayName ?? "",
        p.country ?? "",
        p.city ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [data, query]);

  if (loading) {
    return <div className="small" style={{ color: "var(--muted)" }}>Cargando comunidad…</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (!data || data.length === 0) {
    return (
      <div className="card">
        <p>
          Todavía no hay entrenadores publicados. ¡Sé el primero! Ve a tu{" "}
          <a className="brand" href="/profile">
            perfil
          </a>{" "}
          y activa &quot;Publicar mi carpeta en Comunidad&quot;.
        </p>
      </div>
    );
  }

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <input
          type="search"
          placeholder="Buscar por @handle, nombre o ubicación…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded border border-gray-300 p-2"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="small">Ningún entrenador coincide con esa búsqueda.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gap: "1rem",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          }}
        >
          {filtered.map((p) => (
            <Link
              key={p.id}
              href={`/community/${p.handle}`}
              className="card"
              style={{
                textDecoration: "none",
                color: "inherit",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                padding: "1rem",
                transition: "transform 120ms, box-shadow 120ms",
              }}
            >
              <header style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {p.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.avatarUrl}
                    alt={p.handle}
                    width={40}
                    height={40}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      objectFit: "cover",
                      border: "2px solid var(--pk-red)",
                    }}
                  />
                ) : (
                  <div
                    aria-hidden
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: "#f4e14a",
                      border: "2px solid #111",
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 800,
                      color: "#111",
                    }}
                  >
                    {p.handle.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800 }}>
                    @{p.handle}
                  </div>
                  {p.displayName && (
                    <div
                      className="small"
                      style={{
                        color: "var(--muted)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {p.displayName}
                    </div>
                  )}
                </div>
              </header>

              <div className="small" style={{ color: "var(--muted)" }}>
                📍 {locationOf(p)}
              </div>

              {p.discord && (
                <div className="small" style={{ color: "var(--muted)" }}>
                  💬 {p.discord}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  gap: 4,
                  flexWrap: "wrap",
                }}
              >
                {p.previews.slice(0, 4).map((src, idx) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={idx}
                    src={src}
                    alt=""
                    width={46}
                    height={64}
                    style={{
                      width: 46,
                      height: 64,
                      objectFit: "cover",
                      borderRadius: 4,
                      border: "1px solid var(--border)",
                    }}
                  />
                ))}
                {p.previews.length === 0 && (
                  <span className="small" style={{ color: "var(--muted)" }}>
                    Sin cartas todavía
                  </span>
                )}
              </div>

              <footer
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 4,
                  paddingTop: 8,
                  borderTop: "1px solid var(--border)",
                }}
              >
                <span className="small">
                  <strong>{p.cardCount}</strong> cartas
                </span>
                <span style={{ fontWeight: 800, color: "#15803d" }}>
                  {currency(p.totalValue)}
                </span>
              </footer>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
