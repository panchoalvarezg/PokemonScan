import { DashboardClient } from '@/components/DashboardClient';

export default function DashboardPage() {
  return (
    <main className="page">
      <div className="container grid">
        <div>
          <h1>Dashboard contable</h1>
          <p className="small">Calcula el valor total estimado del inventario y sus indicadores principales.</p>
        </div>
        <DashboardClient />
      </div>
    </main>
  );
}
