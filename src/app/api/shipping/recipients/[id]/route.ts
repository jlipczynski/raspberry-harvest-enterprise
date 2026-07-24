import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenantId = await requireTenantId()
    const { id } = await params

    // tenantId w warunku, żeby nie dało się skasować cudzego odbiorcy po ID.
    const existing = await prisma.shippingRecipient.findFirst({
      where: { id, tenantId },
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Nie znaleziono odbiorcy' }, { status: 404 })
    }

    await prisma.shippingRecipient.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Nie udało się usunąć odbiorcy' }, { status: 500 })
  }
}
