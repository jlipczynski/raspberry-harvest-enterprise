"use client";

import { DeliverySummary } from "@/lib/types";
import { formatKgNum, formatPLN } from "@/lib/format";

export default function SummaryBar({ s }: { s: DeliverySummary }) {
  return (
    <div className="card mb-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="stat">
          <span className="stat-label">Zamówienia</span>
          <span className="stat-value">{s.orders_count}</span>
        </div>
        <div className="stat">
          <span className="stat-label">kg II gat.</span>
          <span className="stat-value">{formatKgNum(s.kg_second)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">kg Premium</span>
          <span className="stat-value">{formatKgNum(s.kg_premium)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Kwota</span>
          <span className="stat-value">{formatPLN(s.amount_ordered)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Odebrane</span>
          <span className="stat-value">
            {s.delivered_count}/{s.orders_count}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Kwota odebr.</span>
          <span className="stat-value">{formatPLN(s.amount_delivered)}</span>
        </div>
      </div>
    </div>
  );
}
