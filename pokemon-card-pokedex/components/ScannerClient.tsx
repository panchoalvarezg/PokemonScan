"use client";

import { useEffect, useRef, useState } from "react";
import { createWorker, PSM } from "tesseract.js";

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
  const workerRef = useRef<any>(null);

  const [loading, setLoading] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState("");
  const [scanData, setScanData] = useState<ScanData | null>(null);
  const [matchData, setMatchData] = useState<MatchResponse | null>(null);

  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  async function getWorker() {
    if (workerRef.current) return workerRef.current;

    const worker = await createWorker("eng");
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: "1",
    });

    workerRef.current = worker;
    return worker;
  }

  async function startCamera() {
    try {
      setError("");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
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
      if (lower.includes(keyword)) hints.push(keyword);
    }

    return hints;
  }

  function chooseBestName(lines: string[]) {
    const blacklist = [
      "hp",
      "weakness",
      "resistance",
      "retreat",
      "attack",
      "ability",
      "trainer",
      "energy",
      "basic",
      "stage",
      "pokemon power",
      "rain splash",
      "seashell attack",
    ];

    const scored = lines
      .map((line) => {
        const clean = line.trim();
        const lower = clean.toLowerCase();

        let score = 0;

        if (/^[A-Za-z][A-Za-z0-9\-'. ]{2,24}$/.test(clean)) score += 50;
        if (/^[A-Z][a-z]+([ -][A-Z]?[a-z]+)*$/.test(clean)) score += 25;
        if (clean.length >= 4 && clean.length <= 18) score += 20;
        if (/\d/.test(clean)) score -= 15;

        for (const word of blacklist) {
          if (lower.includes(word)) score -= 30;
        }

        return { clean, score };
      })
      .sort((a, b) => b.score - a.score);

    return scored[0]?.clean || "";
  }

  function extractCardData(text: string): ScanData {
    const normalized = normalizeText(text);
    const lines = normalized
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const detectedName = chooseBestName(lines);

    const numberMatch =
      normalized.match(/\b([A-Z]{0,3}\d{1,3}\/[A-Z]{0,3}\d{1,3})\b/i) ||
      normalized.match(/\b(\d{1,3}\/\d{1,3})\b/i) ||
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
      "Black & White",
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

  function preprocessCenterCrop(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
    const fullW = video.videoWidth || 1280;
    const fullH = video.videoHeight || 720;

    canvas.width = fullW;
    canvas.height = fullH;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, fullW, fullH);

    const cropW = Math.floor(fullW * 0.62);
    const cropH = Math.floor(fullH * 0.78);
    const cropX = Math.floor((fullW - cropW) / 2);
    const cropY = Math.floor((fullH - cropH) / 2);

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = cropW;
    cropCanvas.height = cropH;
    const cropCtx = cropCanvas.getContext("2d");
    if (!cropCtx) return null;

    cropCtx.drawImage(
      canvas,
      cropX,
      cropY,
      cropW,
      cropH,
      0,
      0,
      cropW,
      cropH
    );

    const imageData = cropCtx.getImageData(0, 0, cropW, cropH);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const boosted = gray > 150 ? 255 : gray < 90 ? 0 : gray;

      data[i] = boosted;
      data[i + 1] = boosted;
      data[i + 2] = boosted;
    }

    cropCtx.putImageData(imageData, 0, 0);

    return cropCanvas.toDataURL("image/jpeg", 0.95);
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

      const imageBase64 = preprocessCenterCrop(video, canvas);
      if (!imageBase64) {
        setError("No se pudo preparar la imagen.");
        return;
      }

      const worker = await getWorker();
      const { data } = await worker.recognize(imageBase64);

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
          disabled={loading || !cameraReady}
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
          <div className="h-[78%] w-[62%] rounded-xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.22)]" />
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
                <div key={variant.externalId} className="rounded-lg border p-4">
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
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
