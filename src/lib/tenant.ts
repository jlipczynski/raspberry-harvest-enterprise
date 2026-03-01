import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function getTenantId(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  return (session?.user as any)?.tenantId || null
}

export async function requireTenantId(): Promise<string> {
  const tenantId = await getTenantId()
  if (!tenantId) throw new Error("Unauthorized - no tenant")
  return tenantId
}
