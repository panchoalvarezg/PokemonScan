"use client";

import { useEffect, useRef, useState } from "react";

type MatchItem = {
  externalId: string;
  name: string;
  set: string;
  price: number | null;
  confidence: number;
};

type ScanAndMatchResult = {
  extractedText?: string;
  detectedName?: string;
  detectedNumber?: string;
  detectedSet?: string;
  matches?: MatchItem[];
  error?: string;
};

export default function CameraScanner() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isStarting, setIsStarting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [result, setResult] = useState<ScanAndMatchResult | null>(null);

  const [userId, setUserId] = useState("");
  const [condition, setCondition] = useState("ungraded");
  const [quantity, setQuantity] = useState(1);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    return () => stopCamera();
  }, []);

  async function startCamera() {
    setCameraError("");
    setIsStarting(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (error) {
      console.error(error);
      setCameraError("No se pudo acceder a la cámara. Revisa permisos del navegador.");
    } finally {
      setIsStarting(false);
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  function captureImageFromVideo() {
    if (!videoRef.current || !canvasRef.current) return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, width, height);

    // Recorte central para intentar enfocarse en la carta
    const cropWidth = Math.floor(width * 0.7);
    const cropHeight = Math.floor(height * 0.7);
    const cropX = Math.floor((width - cropWidth) / 2);
    const cropY = Math.floor((height - cropHeight) / 2);

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = cropWidth;
    cropCanvas.height = cropHeight;

    const cropCtx = cropCanvas.getContext("2d");
    if (!cropCtx) return null;

    cropCtx.drawImage(
      canvas,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight
    );

    return cropCanvas.toDataURL("image/jpeg", 0.92);
  }

  async function captureAndScan() {
    setResult(null);
    setSaveMessage("");
    setIsScanning(true);

    try {
      const imageBase64 = captureImageFromVideo();

      if (!imageBase64) {
        throw new Error("No se pudo capturar imagen desde la cámara.");
      }

      const scanResponse = await fetch("/api/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imageBase64 }),
      });

      const scanData = await scanResponse.json();

      if (!scanResponse.ok) {
        throw new Error(scanData.error || "Error escaneando carta");
      }

      const matchResponse = await fetch("/api/match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: scanData.detectedName,
          number: scanData.detectedNumber,
          set: scanData.detectedSet,
          extractedText: scanData.extractedText,
        }),
      });

      const matchData = await matchResponse.json();

      if (!matchResponse.ok) {
        throw new Error(matchData.error || "Error buscando coincidencias");
      }

      setResult({
        ...scanData,
        ...matchData,
      });
    } catch (error) {
      console.error(error);
      setResult({
        error: error instanceof Error ? error.message : "Error inesperado",
      });
    } finally {
      setIsScanning(false);
    }
  }

  async function saveCard(match: MatchItem) {
    if (!userId.trim()) {
      setSaveMessage("Debes ingresar un userId para guardar en inventario.");
      return;
    }

    try {
      setSavingId(match.externalId);
      setSaveMessage("");

      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          externalId: match.externalId,
          productName: match.name,
          setName: match.set,
          cardNumber: result?.detectedNumber || null,
          condition,
          quantity,
          estimatedUnitValue: match.price ?? 0,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo guardar la carta");
      }

      setSaveMessage("Carta guardada correctamente en el inventario.");
    } catch (error) {
      console.error(error);
      setSaveMessage(
        error instanceof Error ? error.message : "No se pudo guardar la carta"
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border p-4">
        <h2 className="mb-3 text-lg font-semibold">Cámara</h2>

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={startCamera}
            disabled={isStarting}
            className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            {isStarting ? "Abriendo..." : "Abrir cámara"}
          </button>

          <button
            onClick={stopCamera}
            className="rounded-md border px-4 py-2"
          >
            Detener cámara
          </button>

          <button
            onClick={captureAndScan}
            disabled={isScanning}
            className="rounded-md bg-green-700 px-4 py-2 text-white disabled:opacity-50"
          >
            {isScanning ? "Escaneando..." : "Capturar y escanear"}
          </button>
        </div>

        {cameraError && (
          <p className="mb-3 text-sm text-red-600">{cameraError}</p>
        )}

        <div className="relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full rounded-lg border bg-black"
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[65%] w-[60%] rounded-xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
          </div>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>

      <div className="rounded-xl border p-4">
        <h2 className="mb-3 text-lg font-semibold">Opciones de guardado</h2>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">User ID</span>
            <input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="UUID del usuario"
              className="w-full rounded-md border px-3 py-2"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Condición</span>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className="w-full rounded-md border px-3 py-2"
            >
              <option value="ungraded">Ungraded</option>
              <option value="near_mint">Near Mint</option>
              <option value="light_played">Light Played</option>
              <option value="moderately_played">Moderately Played</option>
              <option value="heavily_played">Heavily Played</option>
              <option value="damaged">Damaged</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Cantidad</span>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="w-full rounded-md border px-3 py-2"
            />
          </label>
        </div>

        {saveMessage && (
          <p className="mt-3 text-sm text-blue-700">{saveMessage}</p>
        )}
      </div>

      {result && (
        <div className="rounded-xl border p-4">
          <h2 className="mb-3 text-lg font-semibold">Resultado del escaneo</h2>

          {result.error ? (
            <p className="text-red-600">{result.error}</p>
          ) : (
            <>
              <div className="space-y-1 text-sm">
                <p><strong>Nombre detectado:</strong> {result.detectedName || "-"}</p>
                <p><strong>Número detectado:</strong> {result.detectedNumber || "-"}</p>
                <p><strong>Set detectado:</strong> {result.detectedSet || "-"}</p>
                <p><strong>Texto extraído:</strong> {result.extractedText || "-"}</p>
              </div>

              <div className="mt-4">
                <h3 className="mb-2 font-medium">Coincidencias</h3>

                {(result.matches || []).length === 0 ? (
                  <p className="text-sm text-gray-600">No se encontraron coincidencias.</p>
                ) : (
                  <div className="space-y-3">
                    {result.matches?.map((match) => (
                      <div
                        key={match.externalId}
                        className="rounded-lg border p-3"
                      >
                        <p className="font-medium">{match.name}</p>
                        <p className="text-sm text-gray-600">Set: {match.set || "-"}</p>
                        <p className="text-sm text-gray-600">
                          Precio estimado: {match.price !== null ? `$${match.price}` : "-"}
                        </p>
                        <p className="text-sm text-gray-600">
                          Confianza: {match.confidence}
                        </p>

                        <button
                          onClick={() => saveCard(match)}
                          disabled={savingId === match.externalId}
                          className="mt-3 rounded-md bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
                        >
                          {savingId === match.externalId
                            ? "Guardando..."
                            : "Guardar en inventario"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
