"use client";

import { useRef, useState } from "react";
import { createWorker } from "tesseract.js";

type VariantItem = {
  externalId: string;
  name: string;
  set: string;
  variant: string;
  price: number | null;
  confidence: number;
};

type MatchResponse = {
  variants?: VariantItem[];
  error?: string;
};

type ScanData = {
  extractedText: string;
  detectedName: string;
  detectedNumber: string;
  detectedSet: string;
  detectedVariantHints: string[];
};

export default function ScannerClient() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [scanData, setScanData] = useState<ScanData | null>(null);
  const [matchData, setMatchData] = useState<MatchResponse | null>(null);

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

  function normalizeText(text: string) {
    return text
      .replace(/\r/g, "\n")
      .replace(/[^\S\n]+/g, " ")
      .replace(/\n+/g, "\n")
      .trim();
  }

  function detectVariantHints(text: string) {
    const lower = text.toLowerCase();
    const hints: string[] = [];

    const keywords = [
      "promo",
      "holo",
      "reverse holo",
      "full art",
      "secret rare",
      "gx",
      "ex",
      "v",
      "vmax",
      "vstar",
      "trainer gallery",
      "illustration rare",
      "special illustration rare",
    ];

    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        hints.push(keyword);
      }
    }

    return hints;
  }

  function extractCardData(text: string): ScanData {
    const normalized = normalizeText(text);
    const lines = normalized
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const detectedName =
      lines.find((line) => /^[A-Za-z0-9\-\.' ]{3,40}$/.test(line)) || "";

    const numberMatch =
      normalized.match(/\b([A-Z]{0,3}\d{1,3}\/[A-Z]{0,3}\d{1,3})\b/i) ||
      normalized.match(/\b([A-Z]{0,3}\d{1,3})\b/i);

    const setKeywords = [
      "Base Set",
      "Jungle",
      "Fossil",
      "Team Rocket",
      "151",
      "Crown Zenith",
      "Evolving Skies",
      "Paradox Rift",
      "Obsidian Flames",
      "Paldea Evolved",
      "Scarlet & Violet",
    ];

    const detectedSet =
      setKeywords.find((setName) =>
        normalized.toLowerCase().includes(setName.toLowerCase())
      ) || "";

    return {
      extractedText: normalized,
      detectedName,
      detectedNumber: numberMatch?.[1] || "",
      detectedSet,
      detectedVariantHints: detectVariantHints(normalized),
    };
  }

  async function captureAndAnalyze() {
    try {
      setLoading(true);
      setError("");
      setScanData(null);
      setMatchData(null);

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas) {
        setError("No se pudo acceder al video o canvas.");
        return;
      }

      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setError("No se pudo obtener el contexto del canvas.");
        return;
      }

      ctx.drawImage(video, 0, 0);

      const imageBase64 = canvas.toDataURL("image/jpeg", 0.92);

      const worker = await createWorker("eng");
      const { data } = await worker.recognize(imageBase64);
      await worker.terminate();

      const extracted = extractCardData(data.text || "");
      setScanData(extracted);

      const response = await fetch("/api/match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(extracted),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "No se pudo comparar la carta.");
      }

      setMatchData(result);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Error al analizar la carta."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <button
          onClick={startCamera}
          className="rounded-md bg-black px-4 py-2 text-white"
        >
          Abrir cámara
        </button>

        <button
          onClick={captureAndAnalyze}
          disabled={loading}
          className="rounded-md bg-green-700 px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "Analizando..." : "Capturar y detectar"}
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-red-700">
          {error}
        </div>
      )}

      <div className="relative max-w-3xl">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full rounded-xl border bg-black"
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[68%] w-[58%] rounded-xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.22)]" />
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {scanData && (
        <div className="rounded-xl border p-4">
          <h2 className="mb-3 text-xl font-semibold">Datos detectados</h2>

          <div className="space-y-2 text-sm">
            <p><strong>Pokémon detectado:</strong> {scanData.detectedName || "-"}</p>
            <p><strong>Número detectado:</strong> {scanData.detectedNumber || "-"}</p>
            <p><strong>Set detectado:</strong> {scanData.detectedSet || "-"}</p>
            <p>
              <strong>Pistas de variante:</strong>{" "}
              {scanData.detectedVariantHints.length > 0
                ? scanData.detectedVariantHints.join(", ")
                : "-"}
            </p>
            <p><strong>Texto OCR:</strong> {scanData.extractedText || "-"}</p>
          </div>
        </div>
      )}

      {matchData?.variants && (
        <div className="rounded-xl border p-4">
          <h2 className="mb-4 text-xl font-semibold">Variantes encontradas</h2>

          {matchData.variants.length === 0 ? (
            <p className="text-sm text-gray-600">
              No se encontraron variantes para esta carta.
            </p>
          ) : (
            <div className="grid gap-3">
              {matchData.variants.map((variant) => (
                <div
                  key={variant.externalId}
                  className="rounded-lg border p-4"
                >
                  <p className="font-semibold">{variant.name}</p>
                  <p className="text-sm text-gray-600">Set: {variant.set || "-"}</p>
                  <p className="text-sm text-gray-600">
                    Variante: {variant.variant || "-"}
                  </p>
                  <p className="text-sm text-gray-600">
                    Precio: {variant.price !== null ? `$${variant.price}` : "-"}
                  </p>
                  <p className="text-sm text-gray-600">
                    Confianza: {variant.confidence}
                  </p>

                  <button
                    className="mt-3 rounded-md bg-blue-700 px-4 py-2 text-white"
                    onClick={() => alert(`Elegiste: ${variant.name}`)}
                  >
                    Esta es mi carta
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
