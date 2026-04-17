import ScannerClient from "@/components/ScannerClient";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#f4f6fb]">
      
      {/* HEADER */}
      <header className="bg-red-600 text-white p-4 shadow-lg">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">Pokédex de Cartas</h1>
          <span className="bg-white/20 px-3 py-1 rounded-full text-sm">
            Pancho
          </span>
        </div>
      </header>

      {/* CONTENT */}
      <main className="max-w-6xl mx-auto p-6">
        <h2 className="text-2xl font-bold text-blue-700 mb-2">
          Escanear cartas
        </h2>
        <p className="text-gray-500 mb-6">
          Usa la cámara para detectar cartas y obtener su valor.
        </p>

        <ScannerClient />
      </main>
    </div>
  );
}
