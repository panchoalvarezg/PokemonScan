"use client";

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-client";
import { currency } from "@/lib/utils";

type Profile = {
  id: string;
  email: string | null;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  display_name: string | null;
  country: string | null;
  city: string | null;
  discord_handle: string | null;
  phone: string | null;
  trade_notes: string | null;
  is_public: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type MissingRow = {
  setName: string;
  owned: number;
  total: number | null;
  missing: number | null;
  percent: number | null;
};

type ProfileResponse = {
  profile: Profile;
  summary: {
    totals: { entries: number; totalCards: number; totalValue: number };
    trade: { count: number; value: number };
    missing: MissingRow[];
  };
};

// Campos de texto del formulario. Los mantenemos en un único objeto para que
// el form sea una sola superficie editable.
type FormState = {
  display_name: string;
  full_name: string;
  username: string;
  country: string;
  city: string;
  discord_handle: string;
  phone: string;
  trade_notes: string;
  avatar_url: string;
  is_public: boolean;
};

const EMPTY_FORM: FormState = {
  display_name: "",
  full_name: "",
  username: "",
  country: "",
  city: "",
  discord_handle: "",
  phone: "",
  trade_notes: "",
  avatar_url: "",
  is_public: false,
};

function profileToForm(p: Profile | null): FormState {
  if (!p) return EMPTY_FORM;
  return {
    display_name: p.display_name ?? "",
    full_name: p.full_name ?? "",
    username: p.username ?? "",
    country: p.country ?? "",
    city: p.city ?? "",
    discord_handle: p.discord_handle ?? "",
    phone: p.phone ?? "",
    trade_notes: p.trade_notes ?? "",
    avatar_url: p.avatar_url ?? "",
    is_public: Boolean(p.is_public),
  };
}

export function ProfileClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [dirty, setDirty] = useState(false);
  const [noSession, setNoSession] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/profile", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Error cargando el perfil.");
      setData(json);
      setForm(profileToForm(json.profile));
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) load();
      else {
        setNoSession(true);
        setLoading(false);
      }
    });
  }, [load]);

  // onChange genérico para campos de texto. Los booleanos (is_public) usan
  // su propio setter porque ChangeEvent.value es siempre string.
  type StringField = {
    [K in keyof FormState]: FormState[K] extends string ? K : never;
  }[keyof FormState];
  function onChange(field: StringField) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [field]: e.target.value }));
      setDirty(true);
    };
  }

  function onToggle(field: "is_public") {
    return (e: ChangeEvent<HTMLInputElement>) => {
      setForm((f) => ({ ...f, [field]: e.target.checked }));
      setDirty(true);
    };
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await apiFetch("/api/profile", {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudo guardar.");
      setMessage("Perfil actualizado.");
      setData((prev) =>
        prev
          ? {
              ...prev,
              profile: json.profile,
            }
          : prev
      );
      setForm(profileToForm(json.profile));
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    setLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (noSession) {
    return (
      <div className="card">
        <p>
          Debes{" "}
          <a href="/login" className="brand">
            iniciar sesión
          </a>{" "}
          para ver tu perfil.
        </p>
      </div>
    );
  }

  return (
    <div className="grid">
      {error && <div className="error">{error}</div>}
      {message && <div className="notice">{message}</div>}

      {/* 1. Datos personales */}
      <form className="card form" onSubmit={save}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-bold text-lg">Datos personales</h2>
            <p className="small">
              Se muestran a otros usuarios cuando aceptes un intercambio. Todos
              los campos son opcionales.
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <span className="small">
              {data?.profile.email ?? ""}
            </span>
            <button
              type="button"
              className="button secondary"
              onClick={logout}
              disabled={loggingOut}
              title="Cerrar sesión"
            >
              {loggingOut ? "Saliendo…" : "Cerrar sesión"}
            </button>
          </div>
        </div>

        {loading ? (
          <p className="small">Cargando perfil…</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 mt-3">
            <TextField
              label="Nombre público (nick)"
              placeholder="Ej. Pancho TCG"
              value={form.display_name}
              onChange={onChange("display_name")}
            />
            <TextField
              label="Nombre completo"
              value={form.full_name}
              onChange={onChange("full_name")}
            />
            <TextField
              label="@handle público (único)"
              placeholder="pancho"
              value={form.username}
              onChange={onChange("username")}
            />
            <TextField
              label="Avatar (URL)"
              placeholder="https://…"
              value={form.avatar_url}
              onChange={onChange("avatar_url")}
            />
            <TextField
              label="País"
              placeholder="Ej. México"
              value={form.country}
              onChange={onChange("country")}
            />
            <TextField
              label="Ciudad"
              placeholder="Ej. Ciudad de México"
              value={form.city}
              onChange={onChange("city")}
            />
            <TextField
              label="Discord"
              placeholder="Ej. pancho#1234"
              value={form.discord_handle}
              onChange={onChange("discord_handle")}
            />
            <TextField
              label="WhatsApp / teléfono"
              placeholder="+52 55 1234 5678"
              value={form.phone}
              onChange={onChange("phone")}
            />
            <label className="block md:col-span-2">
              <span className="text-xs text-gray-500">
                Sobre mis intercambios
              </span>
              <textarea
                value={form.trade_notes}
                onChange={onChange("trade_notes")}
                placeholder="Busca, acepta envíos, zona, reglas personales, etc."
                className="mt-1 w-full rounded border border-gray-300 p-2"
                rows={3}
              />
            </label>
          </div>
        )}

        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setForm(profileToForm(data?.profile ?? null));
              setDirty(false);
            }}
            disabled={!dirty || saving}
          >
            Descartar cambios
          </button>
          <button
            type="submit"
            className="button"
            disabled={!dirty || saving || loading}
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>

      {/* 2. Pokeintercambios */}
      <div className="card">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-bold text-lg">Pokeintercambios</h2>
            <p className="small">
              Resumen de las cartas que marcaste como disponibles. Administra
              la lista desde el inventario o desde Colecciones.
            </p>
          </div>
          <a className="button secondary" href="/collections">
            Ver carpeta de intercambios
          </a>
        </div>

        {data && (
          <div className="grid gap-3 md:grid-cols-2 mt-3">
            <KPI
              label="Cartas disponibles"
              value={String(data.summary.trade.count)}
            />
            <KPI
              label="Valor total en intercambio"
              value={currency(data.summary.trade.value)}
            />
          </div>
        )}

        {data && data.summary.trade.count === 0 && (
          <p className="small mt-2">
            Aún no marcas ninguna carta para intercambio. Ve al{" "}
            <a className="brand" href="/inventory">
              inventario
            </a>{" "}
            y pulsa la estrella en la carta que quieras ofrecer.
          </p>
        )}

        {/* Toggle "publicar en Comunidad". Auto-guarda al cambiar para que
            el usuario no tenga que pulsar otra vez "Guardar cambios" sólo
            por flipear este switch. */}
        <div
          className="mt-4 rounded-lg border border-gray-200 p-3"
          style={{ background: "rgba(244,225,74,0.08)" }}
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div style={{ maxWidth: 560 }}>
              <h3 className="font-bold" style={{ margin: 0 }}>
                Publicar mi carpeta en Comunidad
              </h3>
              <p className="small" style={{ margin: "0.25rem 0 0" }}>
                Si lo activas, otros usuarios podrán ver tu @handle, país ·
                ciudad, Discord (si lo pusiste) y las cartas marcadas para
                intercambio. Tu email y teléfono NUNCA se exponen.
              </p>
              {!form.username && (
                <p className="small" style={{ color: "var(--pk-red)", marginTop: 4 }}>
                  ⚠️ Necesitas un @handle (campo &quot;Usuario único&quot;) para publicar.
                </p>
              )}
            </div>
            <label
              className="flex items-center gap-2"
              style={{ cursor: form.username ? "pointer" : "not-allowed" }}
            >
              <input
                type="checkbox"
                checked={form.is_public}
                onChange={onToggle("is_public")}
                disabled={!form.username}
                style={{ width: 18, height: 18 }}
              />
              <span className="font-bold">
                {form.is_public ? "Publicada" : "Oculta"}
              </span>
            </label>
          </div>
          {form.is_public && form.username && (
            <p className="small mt-2">
              🔗 Tu perfil público:{" "}
              <a className="brand" href={`/community/${form.username}`}>
                /community/{form.username}
              </a>
            </p>
          )}
        </div>
      </div>

      {/* El 'Resumen de cuenta' (cartas que faltan por expansión) vive en
          /collections para quedar junto a la vista de expansiones. */}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-gray-500">{label}</span>
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="mt-1 w-full rounded border border-gray-300 p-2"
      />
    </label>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-bold text-lg">{value}</p>
    </div>
  );
}
