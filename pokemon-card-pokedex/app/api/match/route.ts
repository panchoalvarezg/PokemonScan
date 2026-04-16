import { NextResponse } from "next/server";
import { searchCard } from "@/services/pokemon-price-tracker/client";

export async function POST(req: Request) {
  const body = await req.json();

  const data = await searchCard(body.name);

  return NextResponse.json(data);
}
