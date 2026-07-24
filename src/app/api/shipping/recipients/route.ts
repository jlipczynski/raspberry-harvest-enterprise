import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const tenantId = await requireTenantId()
    const recipients = await prisma.shippingRecipient.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({ recipients })
  } catch {
    return NextResponse.json({ error: 'Nie udało się pobrać odbiorców' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = await requireTenantId()
    const body = await request.json()
    const name = String(body.name || '').trim()
    if (!name) {
      return NextResponse.json({ error: 'Podaj nazwę odbiorcy' }, { status: 400 })
    }

    const address = body.address ? String(body.address).trim() || null : null

    // Ten sam odbiorca nie powiela się — jeśli już jest, zwracamy istniejącego.
    const existing = await prisma.shippingRecipient.findFirst({
      where: { tenantId, name },
    })
    if (existing) {
      const updated = address && address !== existing.address
        ? await prisma.shippingRecipient.update({ where: { id: existing.id }, data: { address } })
        : existing
      return NextResponse.json({ recipient: updated })
    }

    const recipient = await prisma.shippingRecipient.create({
      data: { tenantId, name, address },
    })
    return NextResponse.json({ recipient })
  } catch {
    return NextResponse.json({ error: 'Nie udało się zapisać odbiorcy' }, { status: 500 })
  }
}
