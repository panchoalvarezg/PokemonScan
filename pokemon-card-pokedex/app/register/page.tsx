import { AuthForm } from '@/components/AuthForm';

export default function RegisterPage() {
  return (
    <main className="page">
      <div className="container grid" style={{ maxWidth: 520 }}>
        <h1>Crear cuenta</h1>
        <AuthForm mode="register" />
      </div>
    </main>
  );
}
