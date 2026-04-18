import { CommunityProfileClient } from "@/components/CommunityProfileClient";

/**
 * /community/[handle] — detalle de un entrenador publicado.
 * El componente cliente se encarga de hacer fetch a
 * /api/community/[handle] y renderizar cartas + datos.
 */
type Params = { params: Promise<{ handle: string }> };

export default async function CommunityProfilePage({ params }: Params) {
  const { handle } = await params;

  return (
    <main className="container" style={{ padding: "24px 0" }}>
      <nav className="small" style={{ marginBottom: 8 }}>
        <a className="brand" href="/community">
          ← Volver a Comunidad
        </a>
      </nav>
      <CommunityProfileClient handle={handle} />
    </main>
  );
}
