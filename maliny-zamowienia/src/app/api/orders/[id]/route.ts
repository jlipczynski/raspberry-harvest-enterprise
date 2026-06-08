import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toNum(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// PATCH /api/orders/[id] — aktualizuje TYLKO pola obecne w body
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const admin = getAdminClient();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Brak danych" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if ("kg_second" in body) data.kg_second = toNum(body.kg_second);
  if ("kg_premium" in body) data.kg_premium = toNum(body.kg_premium);
  if ("delivered" in body) data.delivered = body.delivered === true;
  if ("notes" in body) data.notes = body.notes == null ? null : String(body.notes).trim() || null;
  if ("customer_id" in body && body.customer_id) data.customer_id = String(body.customer_id);

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Brak pól do aktualizacji" }, { status: 400 });
  }

  const { data: updated, error } = await admin
    .from("orders")
    .update(data)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(updated);
}

// DELETE /api/orders/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const admin = getAdminClient();
  const { error } = await admin.from("orders").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
