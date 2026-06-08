"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Delivery, OrderWithCustomer, Prices } from "@/lib/types";
import {
  formatDate,
  formatKgNum,
  formatPhone,
  formatPLN,
  weekday,
} from "@/lib/format";

interface OrdersResponse {
  delivery: Delivery;
  prices: Prices;
  orders: OrderWithCustomer[];
}

export default function DrukPage({
  params,
}: {
  params: { deliveryId: string };
}) {
  const [data, setData] = useState<OrdersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<OrdersResponse>(`/api/deliveries/${params.deliveryId}/orders`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Błąd"));
  }, [params.deliveryId]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return <p className="text-gray-500">Ładowanie…</p>;

  const totalSecond = data.orders.reduce((a, o) => a + o.kg_second, 0);
  const totalPremium = data.orders.reduce((a, o) => a + o.kg_premium, 0);
  const totalAmount = data.orders.reduce((a, o) => a + o.amount, 0);

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between">
        <a href="/dostawy" className="text-sm text-raspberry">
          ← Wstecz
        </a>
        <button className="btn-primary" onClick={() => window.print()}>
          🖨 Drukuj
        </button>
      </div>

      <h1 className="mb-1 text-xl font-bold">
        Lista dostawy — {weekday(data.delivery.delivery_date)},{" "}
        {formatDate(data.delivery.delivery_date)}
      </h1>
      {data.delivery.note && (
        <p className="mb-3 text-sm text-gray-600">{data.delivery.note}</p>
      )}

      <table className="print-table w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="border border-gray-300 px-2 py-1">Lp.</th>
            <th className="border border-gray-300 px-2 py-1">Imię</th>
            <th className="border border-gray-300 px-2 py-1">Nazwisko</th>
            <th className="border border-gray-300 px-2 py-1">Telefon</th>
            <th className="border border-gray-300 px-2 py-1 text-right">kg II</th>
            <th className="border border-gray-300 px-2 py-1 text-right">kg Prem.</th>
            <th className="border border-gray-300 px-2 py-1 text-right">Kwota</th>
            <th className="border border-gray-300 px-2 py-1 text-center">✔</th>
          </tr>
        </thead>
        <tbody>
          {data.orders.map((o, i) => (
            <tr key={o.id}>
              <td className="border border-gray-300 px-2 py-1">{i + 1}</td>
              <td className="border border-gray-300 px-2 py-1">
                {o.customer?.first_name ?? ""}
              </td>
              <td className="border border-gray-300 px-2 py-1">
                {o.customer?.last_name ?? ""}
              </td>
              <td className="border border-gray-300 px-2 py-1">
                {formatPhone(o.customer?.phone)}
              </td>
              <td className="border border-gray-300 px-2 py-1 text-right">
                {formatKgNum(o.kg_second)}
              </td>
              <td className="border border-gray-300 px-2 py-1 text-right">
                {formatKgNum(o.kg_premium)}
              </td>
              <td className="border border-gray-300 px-2 py-1 text-right">
                {formatPLN(o.amount)}
              </td>
              <td className="border border-gray-300 px-2 py-1 text-center"></td>
            </tr>
          ))}
          {data.orders.length === 0 && (
            <tr>
              <td className="border border-gray-300 px-2 py-2 text-center" colSpan={8}>
                Brak zamówień
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <td className="border border-gray-300 px-2 py-1" colSpan={4}>
              RAZEM
            </td>
            <td className="border border-gray-300 px-2 py-1 text-right">
              {formatKgNum(totalSecond)}
            </td>
            <td className="border border-gray-300 px-2 py-1 text-right">
              {formatKgNum(totalPremium)}
            </td>
            <td className="border border-gray-300 px-2 py-1 text-right">
              {formatPLN(totalAmount)}
            </td>
            <td className="border border-gray-300 px-2 py-1"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
