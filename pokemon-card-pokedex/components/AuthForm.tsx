"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "register";

export function AuthForm({ mode }: { mode: Mode }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    const supabase = createClient();
    const action =
      mode === "login"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo:
                typeof window !== "undefined"
                  ? `${window.location.origin}/auth/callback`
                  : undefined,
            },
          });

    const { data, error: authError } = await action;
    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    if (mode === "register" && !data.session) {
      setMessage(
        "Cuenta creada. Revisa tu correo para confirmar antes de iniciar sesión."
      );
      return;
    }

    setMessage(mode === "login" ? "Sesión iniciada." : "Cuenta creada.");
    router.push("/dashboard");
    router.refresh();
  }

  async function signInWithGoogle() {
    setOauthLoading(true);
    setError("");
    setMessage("");

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/callback`
            : undefined,
      },
    });

    if (authError) {
      setError(authError.message);
      setOauthLoading(false);
    }
    // Si no hay error, Supabase redirige al proveedor (Google). No hace falta
    // hacer router.push: la vuelta llega a /auth/callback.
  }

  return (
    <div className="grid" style={{ gap: "1rem" }}>
      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={oauthLoading}
        className="button"
        style={{
          background: "#ffffff",
          color: "#0f172a",
          border: "1px solid var(--border)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: "0.6rem",
          fontWeight: 600,
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.467-.806 5.956-2.185l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
          />
          <path
            fill="#FBBC05"
            d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
          />
        </svg>
        {oauthLoading ? "Conectando con Google…" : "Continuar con Google"}
      </button>

      <div
        style={{
          textAlign: "center",
          color: "var(--muted)",
          fontSize: "0.85rem",
        }}
      >
        — o con email —
      </div>

      <form className="form card" onSubmit={handleSubmit}>
        <div className="field">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div className="field">
          <label>Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </div>
        <button className="button" disabled={loading}>
          {loading
            ? "Procesando…"
            : mode === "login"
              ? "Entrar"
              : "Crear cuenta"}
        </button>
        {message ? <div className="notice">{message}</div> : null}
        {error ? <div className="error">{error}</div> : null}
      </form>

      <div className="small" style={{ textAlign: "center" }}>
        {mode === "login" ? (
          <>
            ¿Todavía no tienes cuenta?{" "}
            <a href="/register" className="brand">
              Regístrate
            </a>
          </>
        ) : (
          <>
            ¿Ya tienes cuenta?{" "}
            <a href="/login" className="brand">
              Inicia sesión
            </a>
          </>
        )}
      </div>
    </div>
  );
}
