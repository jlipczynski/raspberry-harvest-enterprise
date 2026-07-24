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

    const existing = await prisma.packagingFormat.findFirst({
      where: { id, tenantId },
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Nie znaleziono konfekcji' }, { status: 404 })
    }

    await prisma.packagingFormat.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Nie udało się usunąć konfekcji' }, { status: 500 })
  }
}
