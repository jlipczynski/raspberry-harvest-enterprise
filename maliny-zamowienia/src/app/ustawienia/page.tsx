"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { api, jsonBody } from "@/lib/client";
import { Prices } from "@/lib/types";

export default function UstawieniaPage() {
  const router = useRouter();
  const [priceSecond, setPriceSecond] = useState("");
  const [pricePremium, setPricePremium] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Prices>("/api/settings")
      .then((p) => {
        setPriceSecond(String(p.price_second));
        setPricePremium(String(p.price_premium));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Błąd"))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api("/api/settings", {
        method: "PATCH",
        ...jsonBody({ price_second: priceSecond, price_premium: pricePremium }),
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Błąd");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await api("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div>
      <Header title="Ustawienia" subtitle="Ceny i konto" back="/" />

      {loading && <p className="text-gray-500">Ładowanie…</p>}

      {!loading && (
        <div className="card space-y-4">
          <p className="text-sm font-medium text-gray-700">Ceny (zł za 1 kg)</p>
          <div>
            <label className="label">II gatunek (przetwory)</label>
            <input
              className="input"
              inputMode="decimal"
              value={priceSecond}
              onChange={(e) => {
                setPriceSecond(e.target.value);
                setSaved(false);
              }}
            />
          </div>
          <div>
            <label className="label">Premium (I klasa)</label>
            <input
              className="input"
              inputMode="decimal"
              value={pricePremium}
              onChange={(e) => {
                setPricePremium(e.target.value);
                setSaved(false);
              }}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {saved && <p className="text-sm text-green-600">Zapisano ✓</p>}
          <button className="btn-primary w-full" onClick={save} disabled={saving}>
            {saving ? "Zapisywanie…" : "Zapisz ceny"}
          </button>
          <p className="text-xs text-gray-400">
            Uwaga: kwoty w historii liczone są zawsze z aktualnych cen — zmiana ceny
            przeliczy też dostawy archiwalne.
          </p>
        </div>
      )}

      <button className="btn-ghost mt-6 w-full" onClick={logout}>
        Wyloguj się
      </button>
    </div>
  );
}
