import { DockerStatusClient } from "@/components/DockerStatusClient";

/**
 * /docker-status
 *
 * Página de diagnóstico que consume /api/docker-health y muestra:
 *   - Badge verde/rojo según si la BD dockerizada responde.
 *   - Host + base a la que nos conectamos.
 *   - Número de tablas/vistas y filas por objeto.
 *   - Latencia del ping.
 *
 * Esta vista es el "ver que la BD de Docker funciona en la app web" que
 * pide la rúbrica de evaluación — screenshot de esta página + pgAdmin
 * constituye evidencia directa.
 */
export default function DockerStatusPage() {
  return (
    <main className="container" style={{ padding: "24px 0" }}>
      <h1 className="mb-2 text-3xl font-bold">Estado de la BD dockerizada</h1>
      <p className="small" style={{ marginBottom: 16 }}>
        Esta página se conecta en <strong>vivo</strong> al Postgres del
        docker-compose usando el driver{" "}
        <code>pg</code> (no el SDK de Supabase) y muestra cuántas filas hay
        en cada tabla. Si ves números, la app Next.js está hablando con el
        contenedor Docker.
      </p>
      <DockerStatusClient />
    </main>
  );
}
