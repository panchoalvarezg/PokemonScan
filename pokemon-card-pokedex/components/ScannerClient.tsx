"use client";

import { useRef, useState } from "react";

export default function ScannerClient() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [result, setResult] = useState<any>(null);

  async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
    });

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }

  async function capture() {
    const canvas = document.createElement("canvas");
    const video = videoRef.current!;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0);

    const image = canvas.toDataURL("image/jpeg");

    // 🔥 Llamada a tu backend
    const res = await fetch("/api/scan", {
      method: "POST",
      body: JSON.stringify({ image }),
    });

    const scanData = await res.json();

    const matchRes = await fetch("/api/match", {
      method: "POST",
      body: JSON.stringify(scanData),
      headers: { "Content-Type": "application/json" },
    });

    const match = await matchRes.json();

    setResult(match);
  }

  return (
    <div className="space-y-6">

      {/* Cámara estilo Pokédex */}
      <div className="relative max-w-md mx-auto bg-black rounded-xl overflow-hidden">
        <video ref={videoRef} autoPlay className="w-full" />

        {/* Marco */}
        <div className="absolute inset-10 border-4 border-yellow-400 rounded-xl pointer-events-none"></div>
      </div>

      {/* Botones */}
      <div className="flex gap-3 justify-center">
        <button
          onClick={startCamera}
          className="bg-gray-200 px-4 py-2 rounded"
        >
          Iniciar cámara
        </button>

        <button
          onClick={capture}
          className="bg-red-600 text-white px-6 py-3 rounded-full"
        >
          📸
        </button>
      </div>

      {/* RESULTADO */}
      {result?.variants && (
        <div className="bg-white p-4 rounded-xl shadow">
          <h3 className="text-xl font-bold mb-3">
            Variantes encontradas
          </h3>

          <div className="grid gap-3">
            {result.variants.map((v: any) => (
              <div key={v.externalId} className="border p-3 rounded">
                <p className="font-semibold">{v.name}</p>
                <p className="text-sm text-gray-500">{v.set}</p>
                <p className="text-green-600 font-bold">
                  ${v.price ?? "-"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
