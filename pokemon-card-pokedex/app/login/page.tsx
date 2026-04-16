import { AuthForm } from '@/components/AuthForm';

export default function LoginPage() {
  return (
    <main className="page">
      <div className="container grid" style={{ maxWidth: 520 }}>
        <h1>Iniciar sesión</h1>
        <AuthForm mode="login" />
      </div>
    </main>
  );
}
