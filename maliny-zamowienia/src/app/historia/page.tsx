"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { api } from "@/lib/client";
import { DeliverySummary, OrderWithCustomer, Prices } from "@/lib/types";
import {
  formatDate,
  formatKgNum,
  formatPhone,
  formatPLN,
  fullName,
  telHref,
  weekday,
} from "@/lib/format";

export default function HistoriaPage() {
  const [summaries, setSummaries] = useState<DeliverySummary[]>([]);
  const [, setPrices] = useState<Prices | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    api<{ prices: Prices; summaries: DeliverySummary[] }>("/api/summary")
      .then((d) => {
        setSummaries(d.summaries);
        setPrices(d.prices);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Błąd"))
      .finally(() => setLoading(false));
  }, []);

  const total = summaries.reduce(
    (acc, s) => {
      acc.orders += s.orders_count;
      acc.kgSecond += s.kg_second;
      acc.kgPremium += s.kg_premium;
      acc.amount += s.amount_ordered;
      acc.delivered += s.delivered_count;
      acc.amountDelivered += s.amount_delivered;
      return acc;
    },
    { orders: 0, kgSecond: 0, kgPremium: 0, amount: 0, delivered: 0, amountDelivered: 0 }
  );

  return (
    <div>
      <Header title="Historia dostaw" />

      {loading && <p className="text-gray-500">Ładowanie…</p>}
      {error && <p className="text-red-600">{error}</p>}

      <div className="space-y-3">
        {!loading && summaries.length === 0 && (
          <p className="text-gray-500">Brak dostaw w historii.</p>
        )}

        {summaries.map((s) => (
          <div key={s.delivery.id} className="card">
            <button
              className="flex w-full items-start justify-between text-left"
              onClick={() =>
                setExpanded(expanded === s.delivery.id ? null : s.delivery.id)
              }
            >
              <div>
                <p className="font-semibold text-gray-900">
                  {weekday(s.delivery.delivery_date)}
                </p>
                <p className="text-sm text-gray-500">
                  {formatDate(s.delivery.delivery_date)} ·{" "}
                  {s.delivery.status === "open" ? "otwarta" : "zamknięta"}
                </p>
              </div>
              <span className="text-gray-400">
                {expanded === s.delivery.id ? "▲" : "▼"}
              </span>
            </button>

            <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
              <div className="stat">
                <span className="stat-label">Zam.</span>
                <span className="font-semibold">{s.orders_count}</span>
              </div>
              <div className="stat">
                <span className="stat-label">kg II</span>
                <span className="font-semibold">{formatKgNum(s.kg_second)}</span>
              </div>
              <div className="stat">
                <span className="stat-label">kg Prem.</span>
                <span className="font-semibold">{formatKgNum(s.kg_premium)}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Kwota</span>
                <span className="font-semibold">{formatPLN(s.amount_ordered)}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Odebrane</span>
                <span className="font-semibold">
                  {s.delivered_count}/{s.orders_count}
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">Kwota odebr.</span>
                <span className="font-semibold">{formatPLN(s.amount_delivered)}</span>
              </div>
            </div>

            {expanded === s.delivery.id && <DeliveryDetail id={s.delivery.id} />}
          </div>
        ))}

        {summaries.length > 0 && (
          <div className="card bg-raspberry-light">
            <p className="mb-2 font-bold text-raspberry">RAZEM (sezon)</p>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="stat">
                <span className="stat-label">Zam.</span>
                <span className="font-semibold">{total.orders}</span>
              </div>
              <div className="stat">
                <span className="stat-label">kg II</span>
                <span className="font-semibold">{formatKgNum(total.kgSecond)}</span>
              </div>
              <div className="stat">
                <span className="stat-label">kg Prem.</span>
                <span className="font-semibold">{formatKgNum(total.kgPremium)}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Kwota</span>
                <span className="font-semibold">{formatPLN(total.amount)}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Odebrane</span>
                <span className="font-semibold">{total.delivered}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Kwota odebr.</span>
                <span className="font-semibold">{formatPLN(total.amountDelivered)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DeliveryDetail({ id }: { id: string }) {
  const [orders, setOrders] = useState<OrderWithCustomer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ orders: OrderWithCustomer[] }>(`/api/deliveries/${id}/orders`)
      .then((d) => setOrders(d.orders))
      .catch((e) => setError(e instanceof Error ? e.message : "Błąd"));
  }, [id]);

  if (error) return <p className="mt-3 text-sm text-red-600">{error}</p>;
  if (!orders) return <p className="mt-3 text-sm text-gray-500">Ładowanie…</p>;

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <div className="mb-2 flex justify-end">
        <Link href={`/druk/${id}`} className="text-sm text-raspberry">
          🖨 Drukuj listę
        </Link>
      </div>
      <div className="space-y-2">
        {orders.length === 0 && (
          <p className="text-sm text-gray-500">Brak zamówień.</p>
        )}
        {orders.map((o) => (
          <div
            key={o.id}
            className="flex items-center justify-between border-b border-gray-50 pb-2 text-sm last:border-0"
          >
            <div>
              <p className="font-medium text-gray-900">{fullName(o.customer)}</p>
              {o.customer?.phone && (
                <a href={telHref(o.customer.phone)} className="text-raspberry">
                  {formatPhone(o.customer.phone)}
                </a>
              )}
            </div>
            <div className="text-right text-gray-600">
              <p>
                II {formatKgNum(o.kg_second)} · P {formatKgNum(o.kg_premium)}
              </p>
              <p className="font-semibold text-gray-900">{formatPLN(o.amount)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
