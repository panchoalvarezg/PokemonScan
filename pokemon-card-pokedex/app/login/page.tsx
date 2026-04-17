import { AuthForm } from "@/components/AuthForm";

export default function LoginPage() {
  return (
    <main className="page">
      <div
        className="container grid"
        style={{ maxWidth: 480, margin: "0 auto" }}
      >
        <div>
          <h1>Iniciar sesión</h1>
          <p className="small">
            Entra con Google (SSO), con un código de un solo uso (OTP) enviado
            a tu email, o con tu email y contraseña clásicos.
          </p>
        </div>
        <AuthForm mode="login" />
      </div>
    </main>
  );
}
