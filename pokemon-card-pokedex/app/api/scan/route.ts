import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "OCR movido al cliente" },
    { status: 400 }
  );
}
