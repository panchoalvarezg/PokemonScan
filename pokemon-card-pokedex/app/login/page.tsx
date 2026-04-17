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
        </div>
        <AuthForm mode="login" />
      </div>
    </main>
  );
}
