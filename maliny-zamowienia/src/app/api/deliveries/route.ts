import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/deliveries?status=open — lista dostaw (najnowsze pierwsze)
export async function GET(req: Request) {
  const admin = getAdminClient();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  let query = admin
    .from("deliveries")
    .select("*")
    .order("delivery_date", { ascending: false });
  if (status === "open" || status === "closed") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/deliveries — nowa dostawa (data unikalna)
export async function POST(req: Request) {
  const admin = getAdminClient();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const delivery_date = body?.delivery_date ? String(body.delivery_date) : "";
  if (!delivery_date) {
    return NextResponse.json({ error: "Wybierz datę dostawy" }, { status: 400 });
  }
  const note = body?.note == null ? null : String(body.note).trim() || null;

  const { data, error } = await admin
    .from("deliveries")
    .insert({ delivery_date, note })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Dostawa na ten dzień już istnieje" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
