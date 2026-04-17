"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Barra de navegación principal.
 *
 * Decisión de producto: el email del usuario y el botón "Salir" viven en
 * /profile, no aquí arriba. La Navbar sólo expone el enlace a "Perfil"
 * cuando hay sesión, para mantener la cabecera limpia.
 */
export function Navbar() {
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setIsAuthed(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthed(!!session?.user);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <nav className="nav">
      <div className="container nav-inner">
        <Link href="/" className="brand">
          Pokedex TCG
        </Link>
        <div className="nav-links">
          <Link href="/scanner">Scanner</Link>
          <Link href="/inventory">Inventario</Link>
          <Link href="/collections">Colecciones</Link>
          <Link href="/dashboard">Dashboard</Link>
          {isAuthed ? (
            <Link href="/profile">Perfil</Link>
          ) : isAuthed === false ? (
            <>
              <Link href="/login">Login</Link>
              <Link href="/register">Registro</Link>
            </>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
