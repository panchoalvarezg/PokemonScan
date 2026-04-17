"use client";

import { useRef, useState } from "react";

export default function CameraScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [result, setResult] = useState<any>(null);

  async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
    });

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
  }

async function capture() {
  const video = videoRef.current;
  const canvas = canvasRef.current;

  if (!video || !canvas) return;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.drawImage(video, 0, 0);

  const image = canvas.toDataURL("image/jpeg");

  // 1️⃣ OCR (scan)
  const res = await fetch("/api/scan", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ imageBase64: image }),
  });

  const scanData = await res.json();

  console.log("SCAN DATA:", scanData);

  // 2️⃣ MATCH (AQUÍ VA LO IMPORTANTE)
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

  console.log("MATCH DATA:", matchData);

  // 3️⃣ Guardar resultado
  setResult(matchData);
}
