import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Brak uprawnień" }, { status: 403 })
  }
  const users = await prisma.user.findMany({
    include: { tenant: { select: { name: true } } },
    orderBy: { createdAt: "desc" }
  })
  return NextResponse.json({ users: users.map(u => ({
    id: u.id, email: u.email, name: u.name, role: u.role,
    tenant: u.tenant, createdAt: u.createdAt
  }))})
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Brak uprawnień" }, { status: 403 })
  }
  const body = await req.json()
  const { email, password, name, farmName, role } = body
  if (!email || !password || !name) {
    return NextResponse.json({ error: "Wymagane: email, hasło, nazwa" }, { status: 400 })
  }
  
  // Check if email exists
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: "Email już istnieje" }, { status: 400 })
  }
  
  // Create or find tenant
  let tenant = farmName 
    ? await prisma.tenant.findFirst({ where: { name: farmName } })
    : null
  if (!tenant && farmName) {
    tenant = await prisma.tenant.create({ data: { name: farmName } })
  }
  if (!tenant) {
    return NextResponse.json({ error: "Wymagana nazwa gospodarstwa" }, { status: 400 })
  }
  
  const passwordHash = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({
    data: { email, passwordHash, name, role: role || "MANAGER", tenantId: tenant.id }
  })
  return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } })
}
