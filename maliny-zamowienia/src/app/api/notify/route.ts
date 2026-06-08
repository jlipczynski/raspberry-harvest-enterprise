import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Placeholder pod przyszłą integrację SMS (SMSAPI.pl / SerwerSMS.pl).
// Numery klientów są już znormalizowane do 9 cyfr, co ułatwi integrację.
export async function GET() {
  return NextResponse.json(
    { error: "Powiadomienia SMS nie są jeszcze zaimplementowane." },
    { status: 501 }
  );
}

export async function POST() {
  return NextResponse.json(
    { error: "Powiadomienia SMS nie są jeszcze zaimplementowane." },
    { status: 501 }
  );
}
