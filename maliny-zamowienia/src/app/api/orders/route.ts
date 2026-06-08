import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toNum(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// POST /api/orders — nowe zamówienie
export async function POST(req: Request) {
  const admin = getAdminClient();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Brak danych" }, { status: 400 });

  const customer_id = body.customer_id ? String(body.customer_id) : "";
  const delivery_id = body.delivery_id ? String(body.delivery_id) : "";
  if (!customer_id || !delivery_id) {
    return NextResponse.json(
      { error: "Wybierz klienta i dostawę" },
      { status: 400 }
    );
  }

  const insert = {
    customer_id,
    delivery_id,
    kg_second: toNum(body.kg_second),
    kg_premium: toNum(body.kg_premium),
    delivered: body.delivered === true,
    notes: body.notes == null ? null : String(body.notes).trim() || null,
  };

  const { data, error } = await admin.from("orders").insert(insert).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
