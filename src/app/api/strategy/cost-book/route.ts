import { prisma } from '@/lib/prisma'
import { requireTenantId } from '@/lib/tenant'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/** GET — cennik tenanta: pozycje ogólne + ceny per odmiana. */
export async function GET() {
  try {
    const tenantId = await requireTenantId()
    const [items, varieties] = await Promise.all([
      prisma.costItem.findMany({ where: { tenantId }, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] }),
      prisma.varietyPlantingCost.findMany({
        where: { tenantId },
        include: { variety: { select: { id: true, name: true } } },
      }),
    ])
    return NextResponse.json({ items, varieties })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch cost book'
    return NextResponse.json({ error: message }, { status: message.includes('Unauthorized') ? 401 : 500 })
  }
}

/**
 * PUT — zapis cennika w całości.
 * body: { items: [{ key, label, category, unit, valuePln, valueEur, sortOrder, note }],
 *         varieties: [{ varietyId, lcPriceEur, lcPricePln, lcGrowEur, lcGrowPln }] }
 */
export async function PUT(request: NextRequest) {
  try {
    const tenantId = await requireTenantId()
    const body = await request.json()

    if (!Array.isArray(body.items)) {
      return NextResponse.json({ error: 'Pole items jest wymagane' }, { status: 400 })
    }

    const num = (v: unknown): number | null => {
      if (v === null || v === undefined || v === '') return null
      const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
      return Number.isFinite(n) ? n : null
    }

    for (const raw of body.items) {
      if (!raw?.key || !raw?.label) {
        return NextResponse.json({ error: 'Każda pozycja cennika wymaga key i label' }, { status: 400 })
      }
      const valuePln = num(raw.valuePln)
      const data = {
        label: String(raw.label),
        category: String(raw.category ?? 'general'),
        unit: String(raw.unit ?? ''),
        valuePln: valuePln ?? 0,
        valueEur: num(raw.valueEur),
        sortOrder: Number.isFinite(raw.sortOrder) ? Number(raw.sortOrder) : 0,
        note: raw.note ? String(raw.note) : null,
      }
      await prisma.costItem.upsert({
        where: { tenantId_key: { tenantId, key: String(raw.key) } },
        create: { tenantId, key: String(raw.key), ...data },
        update: data,
      })
    }

    if (Array.isArray(body.varieties)) {
      for (const raw of body.varieties) {
        if (!raw?.varietyId) continue
        const data = {
          lcPriceEur: num(raw.lcPriceEur),
          lcPricePln: num(raw.lcPricePln),
          lcGrowEur: num(raw.lcGrowEur),
          lcGrowPln: num(raw.lcGrowPln),
        }
        await prisma.varietyPlantingCost.upsert({
          where: { tenantId_varietyId: { tenantId, varietyId: String(raw.varietyId) } },
          create: { tenantId, varietyId: String(raw.varietyId), ...data },
          update: data,
        })
      }
    }

    const [items, varieties] = await Promise.all([
      prisma.costItem.findMany({ where: { tenantId }, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] }),
      prisma.varietyPlantingCost.findMany({
        where: { tenantId },
        include: { variety: { select: { id: true, name: true } } },
      }),
    ])
    return NextResponse.json({ items, varieties })
  } catch (error) {
    console.error('Error saving cost book:', error)
    const message = error instanceof Error ? error.message : 'Failed to save cost book'
    return NextResponse.json({ error: message }, { status: message.includes('Unauthorized') ? 401 : 500 })
  }
}
