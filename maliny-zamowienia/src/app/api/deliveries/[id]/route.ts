import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/deliveries/[id] — pojedyncza dostawa
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("deliveries")
    .select("*")
    .eq("id", params.id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

// PATCH /api/deliveries/[id] — zmiana statusu / notatki / daty
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const admin = getAdminClient();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Brak danych" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if ("status" in body) {
    const s = String(body.status);
    if (s !== "open" && s !== "closed") {
      return NextResponse.json({ error: "Nieprawidłowy status" }, { status: 400 });
    }
    data.status = s;
  }
  if ("note" in body) data.note = body.note == null ? null : String(body.note).trim() || null;
  if ("delivery_date" in body && body.delivery_date) {
    data.delivery_date = String(body.delivery_date);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Brak pól do aktualizacji" }, { status: 400 });
  }

  const { data: updated, error } = await admin
    .from("deliveries")
    .update(data)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Dostawa na ten dzień już istnieje" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(updated);
}

// DELETE /api/deliveries/[id] — tylko gdy brak zamówień
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const admin = getAdminClient();
  const { count, error: countErr } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("delivery_id", params.id);
  if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `Nie można usunąć — dostawa ma ${count} zamówień.` },
      { status: 409 }
    );
  }
  const { error } = await admin.from("deliveries").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
