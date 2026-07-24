import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant'
import { DEFAULT_PACKAGING } from '@/lib/shipping'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const tenantId = await requireTenantId()
    let formats = await prisma.packagingFormat.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    })

    // Pierwsze wejście: zasiej presety jako edytowalne rekordy, żeby dało się
    // je poprawić (użytkownik zgłosił, że domyślne wartości bywają złe).
    if (formats.length === 0) {
      await prisma.packagingFormat.createMany({
        data: DEFAULT_PACKAGING.map((p) => ({
          tenantId,
          unitsPerCarton: p.unitsPerCarton,
          gramsPerUnit: p.gramsPerUnit,
        })),
      })
      formats = await prisma.packagingFormat.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'asc' },
      })
    }

    return NextResponse.json({ formats })
  } catch {
    return NextResponse.json({ error: 'Nie udało się pobrać konfekcji' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = await requireTenantId()
    const body = await request.json()

    const unitsPerCarton = parseInt(String(body.unitsPerCarton), 10)
    const gramsPerUnit = parseInt(String(body.gramsPerUnit), 10)

    if (!Number.isFinite(unitsPerCarton) || unitsPerCarton <= 0) {
      return NextResponse.json({ error: 'Podaj liczbę opakowań w kartonie' }, { status: 400 })
    }
    if (!Number.isFinite(gramsPerUnit) || gramsPerUnit <= 0) {
      return NextResponse.json({ error: 'Podaj gramaturę opakowania' }, { status: 400 })
    }

    // Nie powielamy tej samej konfekcji.
    const existing = await prisma.packagingFormat.findFirst({
      where: { tenantId, unitsPerCarton, gramsPerUnit },
    })
    if (existing) {
      return NextResponse.json({ format: existing })
    }

    const format = await prisma.packagingFormat.create({
      data: { tenantId, unitsPerCarton, gramsPerUnit },
    })
    return NextResponse.json({ format })
  } catch {
    return NextResponse.json({ error: 'Nie udało się zapisać konfekcji' }, { status: 500 })
  }
}
