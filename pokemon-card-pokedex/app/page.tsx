import Link from "next/link";

export default function Home() {
  return (
    <main className="page">
      <div className="container grid">
        <section className="card" style={{ padding: "2.5rem" }}>
          <h1 style={{ margin: 0, fontSize: "2.4rem" }}>
            Pokedex TCG
          </h1>
          <p className="small" style={{ maxWidth: 680 }}>
            Escanea cartas Pokémon, identifica su nombre, expansión y tipo,
            encuéntralas en Pokemon Price Tracker y guárdalas en tu inventario
            con su valor de mercado actual. Los precios se actualizan con el
            tiempo automáticamente.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
            <Link className="button" href="/scanner">
              📷 Escanear carta
            </Link>
            <Link className="button secondary" href="/inventory">
              Ver inventario
            </Link>
            <Link className="button secondary" href="/dashboard">
              Dashboard
            </Link>
          </div>
        </section>

        <section className="grid grid-3">
          <div className="card">
            <h3>1. Escanea</h3>
            <p className="small">
              Con tu cámara o una imagen. OCR con Tesseract extrae el texto y el
              servidor detecta nombre, set y tipo.
            </p>
          </div>
          <div className="card">
            <h3>2. Encuentra</h3>
            <p className="small">
              Consultamos la API de Pokemon Price Tracker para encontrar la
              carta y su precio actual.
            </p>
          </div>
          <div className="card">
            <h3>3. Inventario</h3>
            <p className="small">
              Guarda la carta en tu cuenta (Supabase) y mira la valorización
              total. Refresca precios cuando quieras.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
