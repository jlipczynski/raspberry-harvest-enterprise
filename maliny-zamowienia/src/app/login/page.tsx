"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, jsonBody } from "@/lib/client";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/login", { method: "POST", ...jsonBody({ password }) });
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd logowania");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] flex-col justify-center">
      <div className="mb-8 text-center">
        <div className="text-5xl">🍇</div>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Maliny — Zamówienia</h1>
        <p className="text-sm text-gray-500">Zaloguj się, aby kontynuować</p>
      </div>
      <form onSubmit={submit} className="card space-y-4">
        <div>
          <label className="label" htmlFor="password">
            Hasło
          </label>
          <input
            id="password"
            type="password"
            autoFocus
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? "Logowanie…" : "Zaloguj"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
