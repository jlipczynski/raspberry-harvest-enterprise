"use client";

import { useEffect, useRef, useState } from "react";
import { api, jsonBody } from "@/lib/client";
import { Customer } from "@/lib/types";
import { fullName, formatPhone } from "@/lib/format";

export default function CustomerAutocomplete({
  onSelect,
}: {
  onSelect: (c: Customer) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newC, setNewC] = useState({ first_name: "", last_name: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (term.length < 1) {
        setResults([]);
        setOpen(false);
        return;
      }
      api<Customer[]>(`/api/customers?q=${encodeURIComponent(term)}`)
        .then((d) => {
          setResults(d.slice(0, 20));
          setOpen(true);
        })
        .catch(() => setResults([]));
    }, 200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  async function createCustomer(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const created = await api<Customer>("/api/customers", {
        method: "POST",
        ...jsonBody(newC),
      });
      onSelect(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd");
    }
  }

  if (adding) {
    return (
      <form onSubmit={createCustomer} className="space-y-3">
        <p className="text-sm font-medium text-gray-700">Nowy klient</p>
        <div className="grid grid-cols-2 gap-2">
          <input
            className="input"
            placeholder="Imię"
            value={newC.first_name}
            onChange={(e) => setNewC({ ...newC, first_name: e.target.value })}
          />
          <input
            className="input"
            placeholder="Nazwisko"
            value={newC.last_name}
            onChange={(e) => setNewC({ ...newC, last_name: e.target.value })}
          />
        </div>
        <input
          className="input"
          inputMode="numeric"
          placeholder="Telefon (9 cyfr)"
          value={newC.phone}
          onChange={(e) => setNewC({ ...newC, phone: e.target.value })}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" className="btn-primary flex-1">
            Dodaj i wybierz
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setAdding(false)}
          >
            Anuluj
          </button>
        </div>
      </form>
    );
  }

  return (
    <div>
      <label className="label">Klient</label>
      <input
        className="input"
        placeholder="Szukaj po nazwisku lub imieniu…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
      />
      {open && (
        <div className="mt-1 max-h-60 overflow-y-auto rounded-xl border border-gray-200">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              className="flex w-full items-center justify-between border-b border-gray-100 px-3 py-3 text-left last:border-0 active:bg-gray-50"
              onClick={() => onSelect(c)}
            >
              <span className="font-medium text-gray-900">{fullName(c)}</span>
              <span className="text-sm text-gray-500">{formatPhone(c.phone)}</span>
            </button>
          ))}
          {results.length === 0 && (
            <p className="px-3 py-3 text-sm text-gray-500">Brak wyników</p>
          )}
        </div>
      )}
      <button
        type="button"
        className="btn-secondary mt-2 w-full"
        onClick={() => {
          const parts = q.trim().split(/\s+/);
          setNewC({
            first_name: parts[0] ?? "",
            last_name: parts.slice(1).join(" "),
            phone: "",
          });
          setAdding(true);
        }}
      >
        + Dodaj nowego klienta
      </button>
    </div>
  );
}
