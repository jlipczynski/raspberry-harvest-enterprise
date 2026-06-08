import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, passwordToken } from "@/lib/auth";

// Ścieżki dostępne bez logowania
const PUBLIC = ["/login", "/api/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const password = process.env.APP_PASSWORD;
  // Brak hasła w konfiguracji = brak ochrony (np. lokalny dev). Na produkcji ustaw APP_PASSWORD.
  if (!password) return NextResponse.next();

  const expected = await passwordToken(password);
  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (cookie === expected) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)"],
};
