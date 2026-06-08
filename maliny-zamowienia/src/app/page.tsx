"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import SummaryBar from "@/components/SummaryBar";
import { api } from "@/lib/client";
import { DeliverySummary, Prices } from "@/lib/types";
import { formatDate, formatPLN, weekday } from "@/lib/format";

function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

const SHORTCUTS = [
  { href: "/zamowienia", label: "Nowe zamówienie", icon: "➕" },
  { href: "/dostawy", label: "Dostawy", icon: "🚚" },
  { href: "/klienci", label: "Klienci", icon: "👤" },
  { href: "/historia", label: "Historia", icon: "📋" },
];

export default function PulpitPage() {
  const [summaries, setSummaries] = useState<DeliverySummary[]>([]);
  const [, setPrices] = useState<Prices | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ prices: Prices; summaries: DeliverySummary[] }>("/api/summary?status=open")
      .then((d) => {
        setSummaries(d.summaries);
        setPrices(d.prices);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Błąd"))
      .finally(() => setLoading(false));
  }, []);

  const today = todayISO();
  const upcoming = [...summaries].sort((a, b) =>
    a.delivery.delivery_date.localeCompare(b.delivery.delivery_date)
  );
  const nearest =
    upcoming.find((s) => s.delivery.delivery_date >= today) ?? summaries[0] ?? null;

  return (
    <div>
      <Header
        title="Pulpit"
        right={
          <Link href="/ustawienia" className="text-sm text-raspberry">
            ⚙︎ Ceny
          </Link>
        }
      />

      {loading && <p className="text-gray-500">Ładowanie…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <>
          {nearest ? (
            <Link href={`/zamowienia?delivery=${nearest.delivery.id}`} className="block">
              <p className="mb-1 text-sm font-medium text-gray-600">
                Najbliższa dostawa
              </p>
              <p className="mb-2 text-lg font-semibold text-raspberry">
                {weekday(nearest.delivery.delivery_date)},{" "}
                {formatDate(nearest.delivery.delivery_date)}
              </p>
              <SummaryBar s={nearest} />
            </Link>
          ) : (
            <div className="card mb-4">
              <p className="text-gray-600">Brak otwartych dostaw.</p>
              <Link href="/dostawy" className="btn-primary mt-3 w-full">
                + Dodaj dostawę
              </Link>
            </div>
          )}

          <div className="mb-6 grid grid-cols-2 gap-3">
            {SHORTCUTS.map((s) => (
              <Link key={s.href} href={s.href} className="card flex items-center gap-3">
                <span className="text-2xl">{s.icon}</span>
                <span className="font-medium text-gray-800">{s.label}</span>
              </Link>
            ))}
          </div>

          {upcoming.length > 0 && (
            <>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Otwarte dostawy
              </h2>
              <div className="space-y-2">
                {upcoming.map((s) => (
                  <Link
                    key={s.delivery.id}
                    href={`/zamowienia?delivery=${s.delivery.id}`}
                    className="card flex items-center justify-between"
                  >
                    <div>
                      <p className="font-semibold text-gray-900">
                        {weekday(s.delivery.delivery_date)}
                      </p>
                      <p className="text-sm text-gray-500">
                        {formatDate(s.delivery.delivery_date)} · {s.orders_count} zam.
                      </p>
                    </div>
                    <span className="font-semibold text-raspberry">
                      {formatPLN(s.amount_ordered)}
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
