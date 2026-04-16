import { NextResponse } from "next/server";
import { createWorker } from "tesseract.js";

export async function POST(req: Request) {
  const { imageBase64 } = await req.json();

  const worker = await createWorker("eng");
  const { data } = await worker.recognize(imageBase64);
  await worker.terminate();

  return NextResponse.json({
    text: data.text,
    name: data.text.split("\n")[0],
  });
}
