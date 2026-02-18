import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    const role = req.nextauth.token?.role as string
    const path = req.nextUrl.pathname

    // RECRUITER can only access workers page and workers API
    if (role === "RECRUITER") {
      const allowed = [
        "/dashboard/workers",
        "/api/workers",
        "/api/auth",
      ]
      const isAllowed = allowed.some(p => path.startsWith(p))

      // Allow exact /dashboard (will redirect to workers)
      if (path === "/dashboard") {
        return NextResponse.redirect(new URL("/dashboard/workers", req.url))
      }

      if (!isAllowed) {
        return NextResponse.redirect(new URL("/dashboard/workers", req.url))
      }
    }

    return NextResponse.next()
  },
  {
    pages: { signIn: "/login" }
  }
)

export const config = {
  matcher: ["/dashboard/:path*", "/api/templates/:path*", "/api/varieties/:path*", "/api/plantation/:path*", "/api/workers/:path*"]
}
