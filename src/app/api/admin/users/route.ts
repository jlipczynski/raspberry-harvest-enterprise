import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as Record<string, unknown>).role !== "SUPER_ADMIN") return null
  return session
}

export async function GET() {
  if (!await checkAdmin()) return NextResponse.json({ error: "Brak uprawnień" }, { status: 403 })
  const users = await prisma.user.findMany({
    include: { tenant: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" }
  })
  return NextResponse.json({ users: users.map(u => ({
    id: u.id, email: u.email, name: u.name, role: u.role,
    tenantId: u.tenantId, tenant: u.tenant, createdAt: u.createdAt
  }))})
}

export async function POST(req: Request) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Brak uprawnień" }, { status: 403 })
  const { email, password, name, farmName, role } = await req.json()
  if (!email || !password || !name) return NextResponse.json({ error: "Wymagane: email, hasło, nazwa" }, { status: 400 })
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return NextResponse.json({ error: "Email już istnieje" }, { status: 400 })
  let tenant = farmName ? await prisma.tenant.findFirst({ where: { name: farmName } }) : null
  if (!tenant && farmName) tenant = await prisma.tenant.create({ data: { name: farmName } })
  if (!tenant) return NextResponse.json({ error: "Wymagana nazwa gospodarstwa" }, { status: 400 })
  const passwordHash = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({
    data: { email, passwordHash, name, role: role || "MANAGER", tenantId: tenant.id }
  })
  return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } })
}

export async function PUT(req: Request) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Brak uprawnień" }, { status: 403 })
  const { id, email, name, role, password, farmName } = await req.json()
  if (!id) return NextResponse.json({ error: "Brak ID" }, { status: 400 })
  
  const data: Record<string, unknown> = {}
  if (email) data.email = email
  if (name) data.name = name
  if (role) data.role = role
  if (password) data.passwordHash = await bcrypt.hash(password, 10)
  if (farmName) {
    let tenant = await prisma.tenant.findFirst({ where: { name: farmName } })
    if (!tenant) tenant = await prisma.tenant.create({ data: { name: farmName } })
    data.tenantId = tenant.id
  }
  
  const user = await prisma.user.update({ where: { id }, data, include: { tenant: true } })
  return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, tenant: user.tenant } })
}

export async function DELETE(req: Request) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Brak uprawnień" }, { status: 403 })
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: "Brak ID" }, { status: 400 })
  
  const session = await getServerSession(authOptions)
  if ((session?.user as Record<string, unknown>)?.userId === id) {
    return NextResponse.json({ error: "Nie możesz usunąć siebie" }, { status: 400 })
  }
  
  await prisma.user.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
