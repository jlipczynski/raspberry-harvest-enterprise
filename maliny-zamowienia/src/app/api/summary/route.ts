import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase";
import { getPrices, summarizeDelivery } from "@/lib/pricing";
import { Delivery, Order } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/summary?status=open — podsumowania wszystkich dostaw (najnowsze pierwsze)
export async function GET(req: Request) {
  const admin = getAdminClient();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  let delQuery = admin
    .from("deliveries")
    .select("*")
    .order("delivery_date", { ascending: false });
  if (status === "open" || status === "closed") {
    delQuery = delQuery.eq("status", status);
  }

  const { data: deliveries, error: delErr } = await delQuery;
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const { data: orders, error: ordErr } = await admin.from("orders").select("*");
  if (ordErr) return NextResponse.json({ error: ordErr.message }, { status: 500 });

  let prices;
  try {
    prices = await getPrices();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Brak cen" },
      { status: 500 }
    );
  }

  const byDelivery = new Map<string, Order[]>();
  for (const o of (orders ?? []) as Order[]) {
    const arr = byDelivery.get(o.delivery_id) ?? [];
    arr.push(o);
    byDelivery.set(o.delivery_id, arr);
  }

  const summaries = (deliveries ?? []).map((d) =>
    summarizeDelivery(d as Delivery, byDelivery.get((d as Delivery).id) ?? [], prices)
  );

  return NextResponse.json({ prices, summaries });
}
