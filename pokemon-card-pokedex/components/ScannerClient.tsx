"use client";

import { useEffect, useRef, useState } from "react";
import Tesseract from "tesseract.js";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-client";
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
  source?: string;
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
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selected, setSelected] = useState<Variant | null>(null);
  const [saving, setSaving] = useState(false);
  const [condition, setCondition] = useState("near_mint");
  const [quantity, setQuantity] = useState(1);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Campos editables por el usuario (siempre visibles)
  const [manualName, setManualName] = useState("");
  const [manualNumber, setManualNumber] = useState("");
  const [manualSet, setManualSet] = useState("");
  const [manualType, setManualType] = useState("");
  const [extractedText, setExtractedText] = useState("");

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
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
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

  // --- Preprocesado de imagen para OCR ---------------------------------

  function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  /**
   * Recorta la franja superior de la carta (donde está el nombre + HP) y
   * le aplica un umbral de contraste para que Tesseract lea mejor.
   */
  async function extractNameStrip(dataUrl: string): Promise<string> {
    const img = await loadImage(dataUrl);
    const stripH = Math.floor(img.height * 0.14);
    const stripY = Math.floor(img.height * 0.04);
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = stripH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, -stripY);

    // Aumenta contraste y convierte a gris
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < data.data.length; i += 4) {
      const avg =
        (data.data[i] + data.data[i + 1] + data.data[i + 2]) / 3;
      const v = avg > 150 ? 255 : avg < 80 ? 0 : avg;
      data.data[i] = v;
      data.data[i + 1] = v;
      data.data[i + 2] = v;
    }
    ctx.putImageData(data, 0, 0);
    return canvas.toDataURL("image/png");
  }

  /**
   * Recorta la zona inferior donde suele estar el número de carta (ej 125/198)
   */
  async function extractBottomStrip(dataUrl: string): Promise<string> {
    const img = await loadImage(dataUrl);
    const stripH = Math.floor(img.height * 0.1);
    const stripY = img.height - stripH;
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = stripH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, -stripY);
    return canvas.toDataURL("image/png");
  }

  async function runOCR(dataUrl: string): Promise<string> {
    // 1) OCR en la franja del nombre (recortada + alto contraste)
    let text = "";
    try {
      const nameStrip = await extractNameStrip(dataUrl);
      const res = await Tesseract.recognize(nameStrip, "eng", {
        // Menos ruido: sólo texto en bloque
      });
      text += "\n" + (res.data.text ?? "");
    } catch (err) {
      console.warn("OCR strip falló", err);
    }

    // 2) OCR en la franja inferior (para el número /set)
    try {
      const bottomStrip = await extractBottomStrip(dataUrl);
      const res = await Tesseract.recognize(bottomStrip, "eng");
      text += "\n" + (res.data.text ?? "");
    } catch (err) {
      console.warn("OCR bottom falló", err);
    }

    // 3) OCR completo como respaldo
    try {
      const res = await Tesseract.recognize(dataUrl, "eng");
      text += "\n" + (res.data.text ?? "");
    } catch (err) {
      console.warn("OCR full falló", err);
    }

    return text.trim();
  }

  // --- Pipeline principal ----------------------------------------------

  async function processImage(dataUrl: string) {
    setPreview(dataUrl);
    setVariants([]);
    setSelected(null);
    setError("");
    setStatus("");

    try {
      setLoadingStep("Leyendo texto de la carta (OCR optimizado)…");
      const text = await runOCR(dataUrl);
      setExtractedText(text);

      setLoadingStep("Detectando nombre, set y tipo…");
      const scanRes = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const scanData = (await scanRes.json()) as ScanParsed;
      if (!scanRes.ok) {
        throw new Error(
          (scanData as any)?.error || "No se pudo analizar el texto."
        );
      }

      // Rellena los campos editables con lo detectado (el usuario puede
      // corregirlos antes de buscar).
      setManualName(scanData.detectedName);
      setManualNumber(scanData.detectedNumber);
      setManualSet(scanData.detectedSet);
      setManualType(scanData.detectedType);

      await searchVariants({
        name: scanData.detectedName,
        number: scanData.detectedNumber,
        set: scanData.detectedSet,
        type: scanData.detectedType,
        extractedText: text,
        variantHints: scanData.detectedVariantHints,
      });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Error procesando la carta.");
    } finally {
      setLoadingStep("");
    }
  }

  async function searchVariants(input: {
    name: string;
    number?: string;
    set?: string;
    type?: string;
    extractedText?: string;
    variantHints?: string[];
  }) {
    setLoadingStep("Buscando en Pokémon TCG + Pokemon Price Tracker…");
    setError("");
    setStatus("");
    try {
      const matchRes = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          detectedName: input.name,
          detectedNumber: input.number ?? "",
          detectedSet: input.set ?? "",
          detectedType: input.type ?? "",
          extractedText: input.extractedText ?? extractedText,
          detectedVariantHints: input.variantHints ?? [],
          manualQuery: input.name,
        }),
      });
      const matchData = await matchRes.json();
      if (!matchRes.ok) {
        throw new Error(matchData?.error || "No se pudo buscar variantes.");
      }
      setVariants(matchData.variants ?? []);
      setSelected(matchData.best ?? null);
      setStatus(
        matchData.variants?.length
          ? `${matchData.variants.length} coincidencia(s) encontrada(s).`
          : "No hubo resultados. Ajusta el nombre/número/set y pulsa “Buscar” de nuevo."
      );
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Error buscando.");
    } finally {
      setLoadingStep("");
    }
  }

  async function captureFromCamera() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const image = canvas.toDataURL("image/jpeg", 0.95);
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

  async function manualSearch(event?: React.FormEvent) {
    event?.preventDefault();
    if (!manualName.trim()) {
      setError("Escribe al menos el nombre de la carta.");
      return;
    }
    await searchVariants({
      name: manualName.trim(),
      number: manualNumber.trim(),
      set: manualSet.trim(),
      type: manualType.trim(),
    });
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
      const res = await apiFetch("/api/inventory", {
        method: "POST",
        body: JSON.stringify({
          userId,
          externalId: match.externalId,
          productName: match.name,
          setName: match.set,
          cardNumber: scanData?.detectedNumber || null,
          rarity: match.rarity || null,
          cardType: match.cardType || null,
          variant: match.variant || null,
          condition,
          quantity,
          estimatedUnitValue: match.price ?? 0,
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

      {/* Formulario manual / editable siempre visible */}
      <form
        onSubmit={manualSearch}
        className="rounded-xl bg-white shadow p-4 border border-gray-200 space-y-3"
      >
        <h3 className="font-bold text-lg">
          Datos de la carta (edita y pulsa “Buscar”)
        </h3>
        <p className="text-sm text-gray-500">
          Si el OCR no detectó bien, puedes escribir el nombre y/o número
          manualmente. La búsqueda usa la Pokémon TCG API (mejor base de datos
          oficial) y cae a Pokemon Price Tracker si no encuentra.
        </p>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="block">
            <span className="text-xs text-gray-500">Nombre *</span>
            <input
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="Ej: Charizard ex"
              className="mt-1 w-full rounded border border-gray-300 p-2"
              required
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">Número</span>
            <input
              value={manualNumber}
              onChange={(e) => setManualNumber(e.target.value)}
              placeholder="Ej: 125/198"
              className="mt-1 w-full rounded border border-gray-300 p-2"
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">Expansión / Set</span>
            <input
              value={manualSet}
              onChange={(e) => setManualSet(e.target.value)}
              placeholder="Ej: Obsidian Flames"
              className="mt-1 w-full rounded border border-gray-300 p-2"
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">Tipo</span>
            <input
              value={manualType}
              onChange={(e) => setManualType(e.target.value)}
              placeholder="Ej: Fire"
              className="mt-1 w-full rounded border border-gray-300 p-2"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={Boolean(loadingStep)}
          className="rounded-lg bg-blue-600 text-white px-4 py-2 font-bold disabled:opacity-60"
        >
          🔎 Buscar
        </button>
      </form>

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

      {variants.length > 0 && (
        <div className="rounded-xl bg-white shadow p-4 border border-gray-200">
          <h3 className="font-bold text-lg mb-3">Coincidencias encontradas</h3>
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
                        className="w-20 h-28 object-contain rounded"
                      />
                    )}
                    <div className="flex-1">
                      <p className="font-bold">{v.name}</p>
                      <p className="text-xs text-gray-500">
                        {v.set || "—"}
                        {v.cardNumber ? ` · ${v.cardNumber}` : ""}
                      </p>
                      {v.type && (
                        <p className="text-xs text-blue-700 mt-1">
                          Tipo: {v.type}
                        </p>
                      )}
                      <p className="text-green-600 font-bold mt-1">
                        {v.price != null ? currency(v.price) : "Sin precio"}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        Fuente: {v.source ?? "—"} · Confianza: {v.confidence}
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
                onChange={(e) =>
                  setQuantity(Math.max(1, Number(e.target.value)))
                }
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
