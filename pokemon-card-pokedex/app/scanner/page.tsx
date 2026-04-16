import CameraScanner from "@/components/scanner/camera-scanner";

export default function ScannerPage() {
  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="mb-2 text-3xl font-bold">Escáner de cartas Pokémon</h1>
      <p className="mb-6 text-sm text-gray-600">
        Usa la cámara del equipo para capturar una carta, reconocerla y guardarla en tu inventario.
      </p>

      <CameraScanner />
    </main>
  );
}
