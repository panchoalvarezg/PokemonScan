"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Barra de navegación principal.
 *
 * Decisión de producto: el email del usuario y el botón "Salir" viven en
 * /profile, no aquí arriba. La Navbar sólo expone el enlace a "Perfil"
 * cuando hay sesión, para mantener la cabecera limpia.
 *
 * El estilo visual lo define globals.css (.nav / .nav-links / .brand) con la
 * paleta Pokédex. Aquí sólo marcamos el enlace activo para dar feedback.
 */
export function Navbar() {
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
  const pathname = usePathname() ?? "";

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setIsAuthed(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthed(!!session?.user);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  function linkStyle(href: string): React.CSSProperties | undefined {
    const active =
      href === "/" ? pathname === "/" : pathname.startsWith(href);
    return active
      ? {
          background: "rgba(220, 10, 45, 0.12)",
          color: "var(--pk-red)",
          boxShadow: "inset 0 -2px 0 var(--pk-red)",
        }
      : undefined;
  }

  return (
    <nav className="nav">
      <div className="container nav-inner">
        <Link href="/" className="brand">
          CARD4ALL
        </Link>
        <div className="nav-links">
          <Link href="/scanner" style={linkStyle("/scanner")}>
            Scanner
          </Link>
          <Link href="/inventory" style={linkStyle("/inventory")}>
            Inventario
          </Link>
          <Link href="/collections" style={linkStyle("/collections")}>
            Colecciones
          </Link>
          <Link href="/community" style={linkStyle("/community")}>
            Comunidad
          </Link>
          <Link href="/dashboard" style={linkStyle("/dashboard")}>
            Dashboard
          </Link>
          {isAuthed ? (
            <Link href="/profile" style={linkStyle("/profile")}>
              Perfil
            </Link>
          ) : isAuthed === false ? (
            <>
              <Link href="/login" style={linkStyle("/login")}>
                Login
              </Link>
              <Link href="/register" style={linkStyle("/register")}>
                Registro
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
