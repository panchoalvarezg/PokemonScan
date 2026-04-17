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
        </div>
        <AuthForm mode="register" />
      </div>
    </main>
  );
}
