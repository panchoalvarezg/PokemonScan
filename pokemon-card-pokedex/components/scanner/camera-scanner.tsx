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

    const res = await fetch("/api/scan", {
      method: "POST",
      body: JSON.stringify({ imageBase64: image }),
    });

    const data = await res.json();

    const match = await fetch("/api/match", {
      method: "POST",
      body: JSON.stringify(data),
    });

    const matchData = await match.json();

    setResult(matchData);
  }

  return (
    <div>
      <button onClick={startCamera}>Abrir cámara</button>
      <button onClick={capture}>Capturar</button>

      <video ref={videoRef} autoPlay className="w-full" />
      <canvas ref={canvasRef} className="hidden" />

      <pre>{JSON.stringify(result, null, 2)}</pre>
    </div>
  );
}
