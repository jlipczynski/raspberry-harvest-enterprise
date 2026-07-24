import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenantId = await requireTenantId()
    const { id } = await params
    const body = await request.json()

    const unitsPerCarton = parseInt(String(body.unitsPerCarton), 10)
    const gramsPerUnit = parseInt(String(body.gramsPerUnit), 10)

    if (!(unitsPerCarton > 0)) {
      return NextResponse.json({ error: 'Podaj liczbę opakowań w kartonie' }, { status: 400 })
    }
    if (!(gramsPerUnit > 0)) {
      return NextResponse.json({ error: 'Podaj gramaturę opakowania' }, { status: 400 })
    }

    // tenantId w warunku, żeby nie dało się edytować cudzej konfekcji po ID.
    const existing = await prisma.packagingFormat.findFirst({
      where: { id, tenantId },
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Nie znaleziono konfekcji' }, { status: 404 })
    }

    const format = await prisma.packagingFormat.update({
      where: { id },
      data: { unitsPerCarton, gramsPerUnit },
    })
    return NextResponse.json({ format })
  } catch {
    return NextResponse.json({ error: 'Nie udało się zapisać konfekcji' }, { status: 500 })
  }
}

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
