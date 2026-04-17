import { AuthForm } from "@/components/AuthForm";

export default function RegisterPage() {
  return (
    <main className="page">
      <div
        className="container grid"
        style={{ maxWidth: 480, margin: "0 auto" }}
      >
        <div>
          <h1>Crear cuenta</h1>
          <p className="small">
            Regístrate con Google o con email y contraseña. Cada usuario tiene
            su propio inventario gracias a Supabase.
          </p>
        </div>
        <AuthForm mode="register" />
      </div>
    </main>
  );
}
