import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase";
import { normalizePhone } from "@/lib/format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/customers?q=... — lista klientów z liczbą zamówień
export async function GET(req: Request) {
  const admin = getAdminClient();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  let query = admin
    .from("customers")
    .select("*")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (q) {
    query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%`);
  }

  const { data: customers, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: orders, error: ordersErr } = await admin
    .from("orders")
    .select("customer_id");
  if (ordersErr) return NextResponse.json({ error: ordersErr.message }, { status: 500 });

  const counts = new Map<string, number>();
  for (const o of orders ?? []) {
    counts.set(o.customer_id, (counts.get(o.customer_id) ?? 0) + 1);
  }

  const result = (customers ?? []).map((c) => ({
    ...c,
    orders_count: counts.get(c.id) ?? 0,
  }));

  return NextResponse.json(result);
}

// POST /api/customers — nowy klient
export async function POST(req: Request) {
  const admin = getAdminClient();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Brak danych" }, { status: 400 });

  const first_name = String(body.first_name ?? "").trim();
  const last_name = String(body.last_name ?? "").trim();
  if (!first_name && !last_name) {
    return NextResponse.json(
      { error: "Podaj imię lub nazwisko" },
      { status: 400 }
    );
  }
  const phoneRaw = body.phone == null ? null : normalizePhone(String(body.phone));
  const notes = body.notes == null ? null : String(body.notes).trim() || null;

  const { data, error } = await admin
    .from("customers")
    .insert({ first_name, last_name, phone: phoneRaw || null, notes })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
