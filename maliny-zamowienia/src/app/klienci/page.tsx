"use client";

import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import Modal from "@/components/Modal";
import { api, jsonBody } from "@/lib/client";
import { Customer } from "@/lib/types";
import { formatPhone, fullName, telHref } from "@/lib/format";

interface CustomerRow extends Customer {
  orders_count: number;
}

export default function KlienciPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [edit, setEdit] = useState<CustomerRow | null>(null);

  function load() {
    setLoading(true);
    api<CustomerRow[]>("/api/customers")
      .then(setCustomers)
      .catch((e) => setError(e instanceof Error ? e.message : "Błąd"))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter((c) =>
      `${c.first_name} ${c.last_name} ${c.phone ?? ""}`.toLowerCase().includes(term)
    );
  }, [customers, q]);

  async function remove(c: CustomerRow) {
    if (!confirm(`Usunąć klienta: ${fullName(c)}?`)) return;
    try {
      await api(`/api/customers/${c.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Błąd");
    }
  }

  return (
    <div>
      <Header
        title="Klienci"
        subtitle={`${customers.length} osób`}
        right={
          <button className="text-sm text-raspberry" onClick={() => setShowAdd(true)}>
            + Dodaj
          </button>
        }
      />

      <input
        className="input mb-4"
        placeholder="Szukaj…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {loading && <p className="text-gray-500">Ładowanie…</p>}
      {error && <p className="text-red-600">{error}</p>}

      <div className="space-y-2">
        {filtered.map((c) => (
          <div key={c.id} className="card flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold text-gray-900">{fullName(c)}</p>
              {c.phone ? (
                <a href={telHref(c.phone)} className="text-sm text-raspberry">
                  {formatPhone(c.phone)}
                </a>
              ) : (
                <span className="text-sm text-gray-400">brak telefonu</span>
              )}
              <p className="text-xs text-gray-400">{c.orders_count} zamówień</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button className="btn-ghost" onClick={() => setEdit(c)}>
                ✏️
              </button>
              <button className="btn-ghost" onClick={() => remove(c)}>
                🗑
              </button>
            </div>
          </div>
        ))}
        {!loading && filtered.length === 0 && (
          <p className="text-gray-500">Brak klientów.</p>
        )}
      </div>

      {showAdd && (
        <CustomerModal
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}
      {edit && (
        <CustomerModal
          customer={edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function CustomerModal({
  customer,
  onClose,
  onSaved,
}: {
  customer?: Customer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    first_name: customer?.first_name ?? "",
    last_name: customer?.last_name ?? "",
    phone: customer?.phone ?? "",
    notes: customer?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (customer) {
        await api(`/api/customers/${customer.id}`, {
          method: "PATCH",
          ...jsonBody(form),
        });
      } else {
        await api("/api/customers", { method: "POST", ...jsonBody(form) });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Błąd");
      setSaving(false);
    }
  }

  return (
    <Modal title={customer ? "Edytuj klienta" : "Nowy klient"} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Imię</label>
            <input
              className="input"
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Nazwisko</label>
            <input
              className="input"
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className="label">Telefon (9 cyfr)</label>
          <input
            className="input"
            inputMode="numeric"
            value={form.phone ?? ""}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Uwagi (np. drugi telefon)</label>
          <input
            className="input"
            value={form.notes ?? ""}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full" onClick={save} disabled={saving}>
          {saving ? "Zapisywanie…" : "Zapisz"}
        </button>
      </div>
    </Modal>
  );
}
