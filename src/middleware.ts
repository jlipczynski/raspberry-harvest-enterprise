import { withAuth } from "next-auth/middleware"

export default withAuth({
  pages: { signIn: "/login" }
})

export const config = {
  matcher: ["/dashboard/:path*", "/api/templates/:path*", "/api/varieties/:path*", "/api/plantation/:path*"]
}
