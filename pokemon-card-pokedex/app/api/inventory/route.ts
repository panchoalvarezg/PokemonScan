import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const body = await req.json();

  const { data, error } = await supabase
    .from("user_cards")
    .insert(body)
    .select();

  if (error) {
    return NextResponse.json({ error });
  }

  return NextResponse.json(data);
}
