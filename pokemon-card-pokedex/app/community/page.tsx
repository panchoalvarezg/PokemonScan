import { CommunityListClient } from "@/components/CommunityListClient";

/**
 * /community — lista de usuarios que han publicado su carpeta de
 * intercambio. Se muestra el @handle, la ubicación (país · ciudad), el
 * número y valor total de cartas disponibles, y una preview de imágenes.
 */
export default function CommunityPage() {
  return (
    <main className="container" style={{ padding: "24px 0" }}>
      <h1 className="mb-2 text-3xl font-bold">Comunidad</h1>
      <p className="small" style={{ marginBottom: 16 }}>
        Explora las carpetas de intercambio de otros entrenadores. Para
        aparecer en esta lista, activa el switch &quot;Publicar mi carpeta en
        Comunidad&quot; desde tu{" "}
        <a className="brand" href="/profile">
          perfil
        </a>
        .
      </p>
      <CommunityListClient />
    </main>
  );
}
