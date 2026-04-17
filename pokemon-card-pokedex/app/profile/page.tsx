import { ProfileClient } from "@/components/ProfileClient";

/**
 * Pantalla /profile: datos del usuario, Pokeintercambios, resumen de cuenta
 * (cartas que le faltan por expansión) y botón de logout.
 */
export default function ProfilePage() {
  return (
    <main className="container" style={{ padding: "24px 0" }}>
      <h1 className="mb-2 text-3xl font-bold">Mi perfil</h1>
      <p className="small" style={{ marginBottom: 16 }}>
        Guarda tus datos de contacto para intercambios y consulta el resumen de
        tu colección.
      </p>
      <ProfileClient />
    </main>
  );
}
