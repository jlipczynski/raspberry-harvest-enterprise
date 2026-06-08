import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase";
import { getPrices } from "@/lib/pricing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/settings — ceny z bazy
export async function GET() {
  try {
    const prices = await getPrices();
    return NextResponse.json(prices);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Błąd odczytu ustawień" },
      { status: 500 }
    );
  }
}

// PATCH /api/settings — zmiana cen (price_second / price_premium)
export async function PATCH(req: Request) {
  const admin = getAdminClient();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Brak danych" }, { status: 400 });

  const allowed = ["price_second", "price_premium"] as const;
  const rows: { key: string; value: number }[] = [];
  for (const key of allowed) {
    if (key in body) {
      const value = parseFloat(String(body[key]).replace(",", "."));
      if (!Number.isFinite(value) || value < 0) {
        return NextResponse.json(
          { error: `Nieprawidłowa wartość dla ${key}` },
          { status: 400 }
        );
      }
      rows.push({ key, value });
    }
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "Brak cen do aktualizacji" }, { status: 400 });
  }

  const { error } = await admin.from("settings").upsert(rows, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const prices = await getPrices();
  return NextResponse.json(prices);
}
