"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function Navbar() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

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
          {email ? (
            <>
              <span className="small">{email}</span>
              <button className="button secondary" onClick={logout}>
                Salir
              </button>
            </>
          ) : (
            <>
              <Link href="/login">Login</Link>
              <Link href="/register">Registro</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
