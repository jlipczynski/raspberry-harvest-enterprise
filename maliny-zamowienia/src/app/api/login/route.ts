import { NextResponse } from "next/server";
import { AUTH_COOKIE, passwordToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    return NextResponse.json(
      { error: "Brak APP_PASSWORD w konfiguracji serwera" },
      { status: 500 }
    );
  }
  const body = (await req.json().catch(() => null)) as { password?: string } | null;
  if (!body?.password || body.password !== expected) {
    return NextResponse.json({ error: "Nieprawidłowe hasło" }, { status: 401 });
  }
  const token = await passwordToken(expected);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
