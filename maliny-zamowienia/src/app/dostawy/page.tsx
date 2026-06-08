"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Modal from "@/components/Modal";
import { api, jsonBody } from "@/lib/client";
import { DeliverySummary, Prices } from "@/lib/types";
import { formatDate, formatPLN, weekday } from "@/lib/format";

export default function DostawyPage() {
  const [summaries, setSummaries] = useState<DeliverySummary[]>([]);
  const [, setPrices] = useState<Prices | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  function load() {
    setLoading(true);
    api<{ prices: Prices; summaries: DeliverySummary[] }>("/api/summary")
      .then((d) => {
        setSummaries(d.summaries);
        setPrices(d.prices);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Błąd"))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function toggleStatus(s: DeliverySummary) {
    const next = s.delivery.status === "open" ? "closed" : "open";
    if (next === "closed" && !confirm("Zamknąć dostawę? Trafi do Historii.")) return;
    await api(`/api/deliveries/${s.delivery.id}`, {
      method: "PATCH",
      ...jsonBody({ status: next }),
    });
    load();
  }

  return (
    <div>
      <Header
        title="Dostawy"
        right={
          <button className="text-sm text-raspberry" onClick={() => setShowAdd(true)}>
            + Nowa
          </button>
        }
      />

      {loading && <p className="text-gray-500">Ładowanie…</p>}
      {error && <p className="text-red-600">{error}</p>}

      <div className="space-y-3">
        {!loading && summaries.length === 0 && (
          <p className="text-gray-500">Brak dostaw. Dodaj pierwszą.</p>
        )}
        {summaries.map((s) => (
          <div key={s.delivery.id} className="card">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-gray-900">
                  {weekday(s.delivery.delivery_date)}
                </p>
                <p className="text-sm text-gray-500">
                  {formatDate(s.delivery.delivery_date)}
                </p>
                {s.delivery.note && (
                  <p className="mt-1 text-sm text-gray-500">{s.delivery.note}</p>
                )}
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  s.delivery.status === "open"
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-200 text-gray-600"
                }`}
              >
                {s.delivery.status === "open" ? "otwarta" : "zamknięta"}
              </span>
            </div>

            <div className="mt-2 flex justify-between text-sm text-gray-600">
              <span>{s.orders_count} zam.</span>
              <span className="font-semibold text-gray-900">
                {formatPLN(s.amount_ordered)}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <Link
                href={`/zamowienia?delivery=${s.delivery.id}`}
                className="btn-secondary"
              >
                Otwórz
              </Link>
              <Link href={`/druk/${s.delivery.id}`} className="btn-ghost">
                🖨 Drukuj
              </Link>
              <button className="btn-ghost" onClick={() => toggleStatus(s)}>
                {s.delivery.status === "open" ? "Zamknij" : "Wznów"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {showAdd && (
        <AddDeliveryModal
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function AddDeliveryModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!date) {
      setError("Wybierz datę");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api("/api/deliveries", {
        method: "POST",
        ...jsonBody({ delivery_date: date, note }),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Błąd");
      setSaving(false);
    }
  }

  return (
    <Modal title="Nowa dostawa" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label">Data dostawy</label>
          <input
            type="date"
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Notatka (opcjonalnie)</label>
          <input
            className="input"
            placeholder="np. godzina, miejsce"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full" onClick={save} disabled={saving}>
          {saving ? "Zapisywanie…" : "Dodaj dostawę"}
        </button>
      </div>
    </Modal>
  );
}
