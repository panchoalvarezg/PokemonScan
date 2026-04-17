"use client";

import { useEffect, useRef, useState } from "react";
import Tesseract from "tesseract.js";
import { createClient } from "@/lib/supabase/client";
import { currency } from "@/lib/utils";

type Variant = {
  externalId: string;
  name: string;
  set: string;
  variant: string;
  type: string;
  imageUrl: string;
  cardNumber: string;
  price: number | null;
  confidence: number;
};

type ScanParsed = {
  extractedText: string;
  detectedName: string;
  detectedNumber: string;
  detectedSet: string;
  detectedType: string;
  detectedVariantHints: string[];
};

export default function ScannerClient() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loadingStep, setLoadingStep] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [preview, setPreview] = useState<string>("");
  const [scan, setScan] = useState<ScanParsed | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selected, setSelected] = useState<Variant | null>(null);
  const [saving, setSaving] = useState(false);
  const [condition, setCondition] = useState("near_mint");
  const [quantity, setQuantity] = useState(1);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });
  }, []);

  async function startCamera() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error(err);
      setError(
        "No se pudo abrir la cámara. Puedes subir una imagen con el botón de carga."
      );
    }
  }

  async function processImage(dataUrl: string) {
    setPreview(dataUrl);
    setVariants([]);
    setSelected(null);
    setScan(null);
    setError("");
    setStatus("");

    try {
      // 1) OCR en el navegador con Tesseract.js
      setLoadingStep("Leyendo texto de la carta (OCR)…");
      const ocrResult = await Tesseract.recognize(dataUrl, "eng");
      const text = ocrResult.data.text ?? "";

      // 2) Parse en el servidor (nombre, número, set, tipo)
      setLoadingStep("Detectando nombre, set y tipo…");
      const scanRes = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const scanData = await scanRes.json();
      if (!scanRes.ok) {
        throw new Error(scanData?.error || "No se pudo analizar el texto.");
      }
      setScan(scanData);

      // 3) Match con Pokemon Price Tracker API
      setLoadingStep("Buscando la carta en Pokemon Price Tracker…");
      const matchRes = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scanData),
      });
      const matchData = await matchRes.json();
      if (!matchRes.ok) {
        throw new Error(matchData?.error || "No se pudo buscar variantes.");
      }
      setVariants(matchData.variants ?? []);
      setSelected(matchData.best ?? null);
      setStatus(
        matchData.variants?.length
          ? "Carta detectada. Revisa las coincidencias."
          : "No se encontraron coincidencias. Prueba con una foto más nítida."
      );
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Error procesando la carta.");
    } finally {
      setLoadingStep("");
    }
  }

  async function captureFromCamera() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const image = canvas.toDataURL("image/jpeg", 0.92);
    await processImage(image);
  }

  function onFilePicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") processImage(reader.result);
    };
    reader.readAsDataURL(file);
  }

  async function saveToInventory() {
    if (!selected) return;
    if (!userEmail) {
      setError("Debes iniciar sesión para guardar cartas en tu inventario.");
      return;
    }

    setSaving(true);
    setError("");
    setStatus("");
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          externalId: selected.externalId,
          productName: selected.name,
          setName: selected.set,
          cardNumber: selected.cardNumber,
          cardType: selected.type || scan?.detectedType || null,
          imageUrl: selected.imageUrl,
          condition,
          quantity,
          estimatedUnitValue: selected.price ?? 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo guardar.");
      setStatus("✅ Carta guardada en tu inventario con su valor actual.");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Error al guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {!userEmail && (
        <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4 text-yellow-900">
          Inicia sesión para poder agregar cartas a tu inventario.{" "}
          <a href="/login" className="font-bold underline">
            Iniciar sesión
          </a>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-black overflow-hidden relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full aspect-[3/4] object-cover"
          />
          <div className="pointer-events-none absolute inset-6 border-4 border-yellow-400 rounded-xl" />
          <canvas ref={canvasRef} className="hidden" />
        </div>

        <div className="space-y-3">
          <button
            onClick={startCamera}
            className="w-full rounded-lg bg-gray-100 hover:bg-gray-200 px-4 py-2 font-medium"
          >
            📷 Iniciar cámara
          </button>
          <button
            onClick={captureFromCamera}
            disabled={Boolean(loadingStep)}
            className="w-full rounded-lg bg-red-600 text-white px-4 py-3 font-bold disabled:opacity-60"
          >
            Capturar carta
          </button>
          <div className="text-center text-sm text-gray-500">— o —</div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 font-medium"
          >
            📁 Subir imagen
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFilePicked}
          />

          {preview && (
            <img
              src={preview}
              alt="preview"
              className="rounded-lg border border-gray-200 w-full object-contain max-h-64"
            />
          )}
        </div>
      </div>

      {loadingStep && (
        <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-blue-800">
          ⏳ {loadingStep}
        </div>
      )}
      {status && (
        <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-green-800">
          {status}
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-red-800">
          {error}
        </div>
      )}

      {scan && (
        <div className="rounded-xl bg-white shadow p-4 border border-gray-200">
          <h3 className="font-bold text-lg mb-2">Datos detectados</h3>
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-gray-500">Nombre</dt>
            <dd className="font-semibold">{scan.detectedName || "—"}</dd>
            <dt className="text-gray-500">Número</dt>
            <dd>{scan.detectedNumber || "—"}</dd>
            <dt className="text-gray-500">Expansión</dt>
            <dd>{scan.detectedSet || "—"}</dd>
            <dt className="text-gray-500">Tipo</dt>
            <dd>{scan.detectedType || "—"}</dd>
          </dl>
        </div>
      )}

      {variants.length > 0 && (
        <div className="rounded-xl bg-white shadow p-4 border border-gray-200">
          <h3 className="font-bold text-lg mb-3">
            Coincidencias en Pokemon Price Tracker
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            {variants.map((v) => {
              const isActive = selected?.externalId === v.externalId;
              return (
                <button
                  key={v.externalId}
                  onClick={() => setSelected(v)}
                  className={`text-left rounded-lg border p-3 transition ${
                    isActive
                      ? "border-red-500 bg-red-50 ring-2 ring-red-200"
                      : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <div className="flex gap-3">
                    {v.imageUrl && (
                      <img
                        src={v.imageUrl}
                        alt={v.name}
                        className="w-16 h-22 object-contain rounded"
                      />
                    )}
                    <div className="flex-1">
                      <p className="font-bold">{v.name}</p>
                      <p className="text-xs text-gray-500">
                        {v.set || "—"}
                        {v.cardNumber ? ` · ${v.cardNumber}` : ""}
                      </p>
                      {v.type && (
                        <p className="text-xs text-blue-700 mt-1">Tipo: {v.type}</p>
                      )}
                      <p className="text-green-600 font-bold mt-1">
                        {v.price != null ? currency(v.price) : "Sin precio"}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        Confianza: {v.confidence}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selected && (
        <div className="rounded-xl bg-white shadow p-4 border border-gray-200">
          <h3 className="font-bold text-lg mb-3">Agregar a inventario</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className="text-xs text-gray-500">Condición</span>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 p-2"
              >
                <option value="mint">Mint</option>
                <option value="near_mint">Near Mint</option>
                <option value="lightly_played">Lightly Played</option>
                <option value="moderately_played">Moderately Played</option>
                <option value="heavily_played">Heavily Played</option>
                <option value="damaged">Damaged</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Cantidad</span>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                className="mt-1 w-full rounded border border-gray-300 p-2"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Valor unitario</span>
              <div className="mt-1 w-full rounded border border-gray-200 p-2 bg-gray-50">
                {selected.price != null ? currency(selected.price) : "—"}
              </div>
            </label>
          </div>
          <button
            onClick={saveToInventory}
            disabled={saving || !userEmail}
            className="mt-4 rounded-lg bg-green-600 text-white px-4 py-2 font-bold disabled:opacity-60"
          >
            {saving ? "Guardando…" : "💾 Guardar en inventario"}
          </button>
        </div>
      )}
    </div>
  );
}
