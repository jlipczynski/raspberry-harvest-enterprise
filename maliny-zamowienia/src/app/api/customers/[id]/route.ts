import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase";
import { normalizePhone } from "@/lib/format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// PATCH /api/customers/[id] — aktualizuje TYLKO pola obecne w body
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const admin = getAdminClient();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Brak danych" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if ("first_name" in body) data.first_name = String(body.first_name ?? "").trim();
  if ("last_name" in body) data.last_name = String(body.last_name ?? "").trim();
  if ("phone" in body) {
    const p = body.phone == null ? "" : normalizePhone(String(body.phone));
    data.phone = p || null;
  }
  if ("notes" in body) {
    const n = body.notes == null ? "" : String(body.notes).trim();
    data.notes = n || null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Brak pól do aktualizacji" }, { status: 400 });
  }

  const { data: updated, error } = await admin
    .from("customers")
    .update(data)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(updated);
}

// DELETE /api/customers/[id] — tylko gdy brak powiązanych zamówień
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const admin = getAdminClient();

  const { count, error: countErr } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", params.id);
  if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `Nie można usunąć — klient ma ${count} zamówień w historii.` },
      { status: 409 }
    );
  }

  const { error } = await admin.from("customers").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
