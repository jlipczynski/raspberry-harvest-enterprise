import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase";
import { getPrices, orderAmount, summarizeDelivery } from "@/lib/pricing";
import { Delivery, Order } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/deliveries/[id]/orders — zamówienia dostawy + ceny + podsumowanie
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const admin = getAdminClient();

  const { data: delivery, error: delErr } = await admin
    .from("deliveries")
    .select("*")
    .eq("id", params.id)
    .single();
  if (delErr) return NextResponse.json({ error: "Nie znaleziono dostawy" }, { status: 404 });

  const { data: orders, error } = await admin
    .from("orders")
    .select("*, customer:customers(*)")
    .eq("delivery_id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const prices = await getPrices();

  const rows = (orders ?? []).map((o) => ({
    ...o,
    amount: orderAmount(o as Order, prices),
  }));

  // sortuj po nazwisku klienta, potem imieniu
  rows.sort((a, b) => {
    const an = `${a.customer?.last_name ?? ""} ${a.customer?.first_name ?? ""}`.toLowerCase();
    const bn = `${b.customer?.last_name ?? ""} ${b.customer?.first_name ?? ""}`.toLowerCase();
    return an.localeCompare(bn, "pl");
  });

  const summary = summarizeDelivery(
    delivery as Delivery,
    (orders ?? []) as Order[],
    prices
  );

  return NextResponse.json({ delivery, prices, orders: rows, summary });
}
