import { prisma } from '@/lib/prisma'
import { requireTenantId } from '@/lib/tenant'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const fail = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback
  return NextResponse.json({ error: message }, { status: message.includes('Unauthorized') ? 401 : 500 })
}

/** Odmiany rosnące na sekcjach gospodarstwa, wraz z parametrami potrzebnymi do planowania. */
async function load(tenantId: string) {
  const used = await prisma.section.findMany({
    where: { block: { farm: { tenantId } } },
    select: { varietyId: true, shootsPerPot: true },
  })
  const ids = [...new Set(used.map(u => u.varietyId))]
  const varieties = await prisma.variety.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, canesPerPot: true, yieldSummerPerShoot: true, yieldAutumnPerShoot: true },
    orderBy: { name: 'asc' },
  })
  return varieties.map(v => ({
    ...v,
    // co system przyjmie, jeśli odmiana nie ma własnej wartości
    sectionFallback: used.find(u => u.varietyId === v.id)?.shootsPerPot ?? null,
  }))
}

export async function GET() {
  try {
    const tenantId = await requireTenantId()
    return NextResponse.json({ varieties: await load(tenantId) })
  } catch (error) {
    return fail(error, 'Failed to fetch varieties')
  }
}

/**
 * PUT — parametry odmian używanych przez gospodarstwo.
 * body: { varieties: [{ id, canesPerPot }] }
 */
export async function PUT(request: NextRequest) {
  try {
    const tenantId = await requireTenantId()
    const body = await request.json()
    if (!Array.isArray(body.varieties)) {
      return NextResponse.json({ error: 'Pole varieties jest wymagane' }, { status: 400 })
    }

    const owned = await prisma.section.findMany({
      where: { block: { farm: { tenantId } } },
      select: { varietyId: true },
      distinct: ['varietyId'],
    })
    const allowed = new Set(owned.map(o => o.varietyId))

    for (const raw of body.varieties as Record<string, unknown>[]) {
      const id = String(raw.id ?? '')
      if (!allowed.has(id)) {
        return NextResponse.json(
          { error: 'Któraś z odmian nie występuje na sekcjach tego gospodarstwa' },
          { status: 403 }
        )
      }
      const value = raw.canesPerPot
      const parsed =
        value === null || value === undefined || value === ''
          ? null
          : parseFloat(String(value).replace(',', '.'))
      if (parsed !== null && (!Number.isFinite(parsed) || parsed <= 0)) {
        return NextResponse.json({ error: 'Liczba canów na doniczkę musi być większa od zera' }, { status: 400 })
      }
      await prisma.variety.update({ where: { id }, data: { canesPerPot: parsed } })
    }

    return NextResponse.json({ varieties: await load(tenantId) })
  } catch (error) {
    console.error('Error saving variety parameters:', error)
    return fail(error, 'Failed to save varieties')
  }
}
