import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  // Create tenant first
  let tenant = await prisma.tenant.findFirst({ where: { name: "GR Jan Lipczyński" } })
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { name: "GR Jan Lipczyński" }
    })
    console.log("Tenant created:", tenant.name)
  }

  // Create super admin
  const existing = await prisma.user.findUnique({ where: { email: "jan@lipczynski.pl" } })
  if (existing) {
    console.log("Super admin already exists:", existing.email)
    return
  }
  
  const passwordHash = await bcrypt.hash("Admin2025!", 10)
  const user = await prisma.user.create({
    data: {
      email: "jan@lipczynski.pl",
      passwordHash,
      name: "Jan Lipczyński",
      role: "SUPER_ADMIN",
      tenantId: tenant.id,
    }
  })
  console.log("Super admin created:", user.email)
}

main().catch(console.error).finally(() => prisma.$disconnect())
