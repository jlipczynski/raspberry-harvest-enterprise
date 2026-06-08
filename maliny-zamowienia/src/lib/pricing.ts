import { getAdminClient } from "@/lib/supabase";
import { Delivery, DeliverySummary, Order, Prices } from "@/lib/types";

/** Ceny zawsze z tabeli settings — NIGDY na sztywno w kodzie. */
export async function getPrices(): Promise<Prices> {
  const admin = getAdminClient();
  const { data, error } = await admin.from("settings").select("key, value");
  if (error) throw error;
  const map = new Map<string, number>(
    (data ?? []).map((r) => [r.key as string, Number(r.value)])
  );
  const price_second = map.get("price_second");
  const price_premium = map.get("price_premium");
  if (price_second == null || price_premium == null) {
    throw new Error(
      "Brak cen w tabeli settings (price_second / price_premium). Uruchom migrację."
    );
  }
  return { price_second, price_premium };
}

/** Kwota zamówienia liczona na bieżąco z cen z settings. */
export function orderAmount(order: Pick<Order, "kg_second" | "kg_premium">, prices: Prices): number {
  return order.kg_second * prices.price_second + order.kg_premium * prices.price_premium;
}

/** Podsumowanie listy zamówień jednej dostawy. */
export function summarizeDelivery(
  delivery: Delivery,
  orders: Order[],
  prices: Prices
): DeliverySummary {
  let kg_second = 0;
  let kg_premium = 0;
  let amount_ordered = 0;
  let delivered_count = 0;
  let amount_delivered = 0;
  let kg_delivered = 0;

  for (const o of orders) {
    const amount = orderAmount(o, prices);
    kg_second += o.kg_second;
    kg_premium += o.kg_premium;
    amount_ordered += amount;
    if (o.delivered) {
      delivered_count += 1;
      amount_delivered += amount;
      kg_delivered += o.kg_second + o.kg_premium;
    }
  }

  return {
    delivery,
    orders_count: orders.length,
    kg_second,
    kg_premium,
    amount_ordered,
    delivered_count,
    amount_delivered,
    kg_delivered,
  };
}
