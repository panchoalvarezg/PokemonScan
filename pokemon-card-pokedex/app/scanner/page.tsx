import ScannerClient from "@/components/ScannerClient";

export default function ScannerPage() {
  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="mb-2 text-3xl font-bold">Escáner de cartas Pokémon</h1>
      <p className="mb-6 text-sm text-gray-600">
        Apunta la carta con la cámara, captura la imagen y revisa las variantes detectadas.
      </p>

      <ScannerClient />
    </main>
  );
}
