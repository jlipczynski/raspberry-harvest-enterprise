// Wspólny helper do wywołań API z czytelnymi błędami po polsku.
export async function api<T = unknown>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || `Błąd ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const jsonBody = (data: unknown): RequestInit => ({
  body: JSON.stringify(data),
});
