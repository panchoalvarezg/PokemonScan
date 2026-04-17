export default function HomePage() {
  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-3 text-4xl font-bold">PokemonScan</h1>
      <p className="mb-6 text-gray-700">
        Escanea una carta Pokémon con la cámara, detecta el nombre y revisa sus variantes.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <a href="/scanner" className="rounded-xl border p-5 hover:bg-gray-50">
          <h2 className="mb-2 text-xl font-semibold">Ir al escáner</h2>
          <p className="text-sm text-gray-600">
            Abre la cámara, captura la carta y compara resultados.
          </p>
        </a>

        <a href="/inventory" className="rounded-xl border p-5 hover:bg-gray-50">
          <h2 className="mb-2 text-xl font-semibold">Inventario</h2>
          <p className="text-sm text-gray-600">
            Aquí luego verás tus cartas guardadas.
          </p>
        </a>
      </div>
    </main>
  );
}
