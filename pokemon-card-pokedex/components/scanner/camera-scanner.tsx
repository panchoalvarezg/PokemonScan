"use client";

import { useRef, useState } from "react";

export default function CameraScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  async function startCamera() {
    try {
      setError("");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error(err);
      setError("No se pudo abrir la cámara.");
    }
  }

  async function capture() {
    try {
      setError("");

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas) return;

      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(video, 0, 0);

      const image = canvas.toDataURL("image/jpeg");

      // 1) OCR / SCAN
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imageBase64: image }),
      });

      const scanData = await res.json();
      console.log("SCAN DATA:", scanData);

      // 2) MATCH CON PRICECHARTING
      const matchResponse = await fetch("/api/match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: scanData.detectedName || scanData.name || "",
          number: scanData.detectedNumber || "",
          set: scanData.detectedSet || "",
          extractedText: scanData.extractedText || scanData.text || "",
        }),
      });

      const matchData = await matchResponse.json();
      console.log("MATCH DATA:", matchData);

      // 3) GUARDAR RESULTADO EN ESTADO
      setResult({
        scanData,
        matchData,
      });
    } catch (err) {
      console.error(err);
      setError("Error al capturar o comparar la carta.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={startCamera}
          className="rounded border px-4 py-2"
        >
          Abrir cámara
        </button>

        <button
          onClick={capture}
          className="rounded border px-4 py-2"
        >
          Capturar
        </button>
      </div>

      {error && <p className="text-red-600">{error}</p>}

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full max-w-xl rounded border"
      />

      <canvas ref={canvasRef} className="hidden" />

      {result && (
        <div className="rounded border p-4">
          <h2 className="mb-2 text-xl font-semibold">Resultado</h2>

          <div className="mb-4">
            <h3 className="font-medium">Texto detectado</h3>
            <pre className="overflow-auto rounded bg-gray-100 p-2 text-sm">
              {JSON.stringify(result.scanData, null, 2)}
            </pre>
          </div>

          <div>
            <h3 className="font-medium">Coincidencias / precio</h3>
            <pre className="overflow-auto rounded bg-gray-100 p-2 text-sm">
              {JSON.stringify(result.matchData, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
