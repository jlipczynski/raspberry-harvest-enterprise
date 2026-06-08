"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import SummaryBar from "@/components/SummaryBar";
import Modal from "@/components/Modal";
import CustomerAutocomplete from "@/components/CustomerAutocomplete";
import { api, jsonBody } from "@/lib/client";
import {
  Customer,
  Delivery,
  DeliverySummary,
  OrderWithCustomer,
  Prices,
} from "@/lib/types";
import {
  formatDate,
  formatKgNum,
  formatPhone,
  formatPLN,
  fullName,
  telHref,
  weekday,
} from "@/lib/format";

interface OrdersResponse {
  delivery: Delivery;
  prices: Prices;
  orders: OrderWithCustomer[];
  summary: DeliverySummary;
}

function amountOf(kgSecond: number, kgPremium: number, p: Prices): number {
  return kgSecond * p.price_second + kgPremium * p.price_premium;
}

function ZamowieniaInner() {
  const params = useSearchParams();
  const initialDelivery = params.get("delivery");

  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [data, setData] = useState<OrdersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [editOrder, setEditOrder] = useState<OrderWithCustomer | null>(null);

  // Pobierz listę dostaw i wybierz domyślną
  useEffect(() => {
    api<Delivery[]>("/api/deliveries")
      .then((d) => {
        setDeliveries(d);
        const open = d.filter((x) => x.status === "open");
        const def =
          (initialDelivery && d.find((x) => x.id === initialDelivery)?.id) ||
          open[open.length - 1]?.id ||
          d[0]?.id ||
          "";
        setSelectedId(def);
        if (!def) setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Błąd");
        setLoading(false);
      });
  }, [initialDelivery]);

  const load = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api<OrdersResponse>(`/api/deliveries/${id}/orders`);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Błąd");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) load(selectedId);
  }, [selectedId, load]);

  async function toggleDelivered(o: OrderWithCustomer) {
    await api(`/api/orders/${o.id}`, {
      method: "PATCH",
      ...jsonBody({ delivered: !o.delivered }),
    });
    load(selectedId);
  }

  async function removeOrder(o: OrderWithCustomer) {
    if (!confirm(`Usunąć zamówienie: ${fullName(o.customer)}?`)) return;
    await api(`/api/orders/${o.id}`, { method: "DELETE" });
    load(selectedId);
  }

  const selected = deliveries.find((d) => d.id === selectedId);
  const closed = selected?.status === "closed";

  return (
    <div>
      <Header
        title="Zamówienia"
        right={
          selectedId ? (
            <Link href={`/druk/${selectedId}`} className="text-sm text-raspberry">
              🖨 Drukuj
            </Link>
          ) : undefined
        }
      />

      {deliveries.length === 0 && !loading ? (
        <div className="card">
          <p className="text-gray-600">Brak dostaw. Najpierw dodaj dostawę.</p>
          <Link href="/dostawy" className="btn-primary mt-3 w-full">
            + Nowa dostawa
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <label className="label">Dostawa</label>
            <select
              className="input"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {deliveries.map((d) => (
                <option key={d.id} value={d.id}>
                  {weekday(d.delivery_date)}, {formatDate(d.delivery_date)}
                  {d.status === "closed" ? " (zamknięta)" : ""}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="mb-3 text-red-600">{error}</p>}
          {loading && <p className="text-gray-500">Ładowanie…</p>}

          {data && !loading && (
            <>
              <SummaryBar s={data.summary} />

              {!closed && (
                <button
                  className="btn-primary mb-4 w-full"
                  onClick={() => setShowAdd(true)}
                >
                  + Dodaj zamówienie
                </button>
              )}
              {closed && (
                <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  Dostawa zamknięta — tylko podgląd.
                </p>
              )}

              <div className="space-y-2">
                {data.orders.length === 0 && (
                  <p className="text-gray-500">Brak zamówień na tę dostawę.</p>
                )}
                {data.orders.map((o) => (
                  <div key={o.id} className="card">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900">{fullName(o.customer)}</p>
                        {o.customer?.phone && (
                          <a
                            href={telHref(o.customer.phone)}
                            className="text-sm text-raspberry"
                          >
                            {formatPhone(o.customer.phone)}
                          </a>
                        )}
                      </div>
                      <span className="shrink-0 font-semibold text-gray-900">
                        {formatPLN(o.amount)}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-sm text-gray-600">
                      <span>
                        II: <b>{formatKgNum(o.kg_second)}</b> kg · Premium:{" "}
                        <b>{formatKgNum(o.kg_premium)}</b> kg
                      </span>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <button
                        className={`btn flex-1 ${
                          o.delivered
                            ? "bg-green-600 text-white"
                            : "border border-gray-300 bg-white text-gray-700"
                        }`}
                        onClick={() => toggleDelivered(o)}
                        disabled={closed}
                      >
                        {o.delivered ? "✓ Odebrane" : "Odebrane?"}
                      </button>
                      <button
                        className="btn-ghost"
                        onClick={() => setEditOrder(o)}
                        disabled={closed}
                      >
                        ✏️
                      </button>
                      <button
                        className="btn-ghost"
                        onClick={() => removeOrder(o)}
                        disabled={closed}
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {showAdd && data && (
        <AddOrderModal
          deliveryId={selectedId}
          prices={data.prices}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            load(selectedId);
          }}
        />
      )}

      {editOrder && data && (
        <EditOrderModal
          order={editOrder}
          prices={data.prices}
          onClose={() => setEditOrder(null)}
          onSaved={() => {
            setEditOrder(null);
            load(selectedId);
          }}
        />
      )}
    </div>
  );
}

function KgInputs({
  kgSecond,
  kgPremium,
  setKgSecond,
  setKgPremium,
  prices,
}: {
  kgSecond: string;
  kgPremium: string;
  setKgSecond: (v: string) => void;
  setKgPremium: (v: string) => void;
  prices: Prices;
}) {
  const s = parseFloat(kgSecond.replace(",", ".")) || 0;
  const p = parseFloat(kgPremium.replace(",", ".")) || 0;
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">kg II gat. ({formatPLN(prices.price_second)}/kg)</label>
          <input
            className="input"
            inputMode="decimal"
            value={kgSecond}
            onChange={(e) => setKgSecond(e.target.value)}
          />
        </div>
        <div>
          <label className="label">kg Premium ({formatPLN(prices.price_premium)}/kg)</label>
          <input
            className="input"
            inputMode="decimal"
            value={kgPremium}
            onChange={(e) => setKgPremium(e.target.value)}
          />
        </div>
      </div>
      <p className="text-sm text-gray-600">
        Kwota: <b>{formatPLN(amountOf(s, p, prices))}</b>
      </p>
    </>
  );
}

function AddOrderModal({
  deliveryId,
  prices,
  onClose,
  onSaved,
}: {
  deliveryId: string;
  prices: Prices;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [kgSecond, setKgSecond] = useState("");
  const [kgPremium, setKgPremium] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!customer) return;
    setSaving(true);
    setError(null);
    try {
      await api("/api/orders", {
        method: "POST",
        ...jsonBody({
          customer_id: customer.id,
          delivery_id: deliveryId,
          kg_second: kgSecond,
          kg_premium: kgPremium,
        }),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Błąd");
      setSaving(false);
    }
  }

  return (
    <Modal title="Nowe zamówienie" onClose={onClose}>
      {!customer ? (
        <CustomerAutocomplete onSelect={setCustomer} />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-raspberry-light px-3 py-2">
            <span className="font-medium text-raspberry">{fullName(customer)}</span>
            <button className="text-sm text-raspberry" onClick={() => setCustomer(null)}>
              Zmień
            </button>
          </div>
          <KgInputs
            kgSecond={kgSecond}
            kgPremium={kgPremium}
            setKgSecond={setKgSecond}
            setKgPremium={setKgPremium}
            prices={prices}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn-primary w-full" onClick={save} disabled={saving}>
            {saving ? "Zapisywanie…" : "Zapisz zamówienie"}
          </button>
        </div>
      )}
    </Modal>
  );
}

function EditOrderModal({
  order,
  prices,
  onClose,
  onSaved,
}: {
  order: OrderWithCustomer;
  prices: Prices;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kgSecond, setKgSecond] = useState(String(order.kg_second));
  const [kgPremium, setKgPremium] = useState(String(order.kg_premium));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/orders/${order.id}`, {
        method: "PATCH",
        ...jsonBody({ kg_second: kgSecond, kg_premium: kgPremium }),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Błąd");
      setSaving(false);
    }
  }

  return (
    <Modal title={`Edytuj: ${fullName(order.customer)}`} onClose={onClose}>
      <div className="space-y-3">
        <KgInputs
          kgSecond={kgSecond}
          kgPremium={kgPremium}
          setKgSecond={setKgSecond}
          setKgPremium={setKgPremium}
          prices={prices}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full" onClick={save} disabled={saving}>
          {saving ? "Zapisywanie…" : "Zapisz zmiany"}
        </button>
      </div>
    </Modal>
  );
}

export default function ZamowieniaPage() {
  return (
    <Suspense fallback={<p className="p-4 text-gray-500">Ładowanie…</p>}>
      <ZamowieniaInner />
    </Suspense>
  );
}
