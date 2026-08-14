import { prisma } from '@/lib/prisma'
import { requireTenantId } from '@/lib/tenant'
import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

/**
 * PUT — zapis decyzji "czym obsadzam" dla scenariusza.
 * body: { items: [{ sectionId, year, method, producesSummer, producesAutumn, note? }] }
 * Zapis jest całościowy dla przesłanych lat: pozycje z tych lat są zastępowane.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenantId = await requireTenantId()
    const { id } = await params
    const body = await request.json()

    const scenario = await prisma.plantingScenario.findFirst({ where: { id, tenantId } })
    if (!scenario) return NextResponse.json({ error: 'Nie znaleziono scenariusza' }, { status: 404 })

    if (!Array.isArray(body.items)) {
      return NextResponse.json({ error: 'Pole items jest wymagane' }, { status: 400 })
    }

    const items = body.items as Record<string, unknown>[]
    for (const raw of items) {
      if (!raw.sectionId || !Number.isInteger(Number(raw.year))) {
        return NextResponse.json({ error: 'Każda pozycja wymaga sectionId i year' }, { status: 400 })
      }

    }

    // sposób obsadzenia musi istnieć na liście gospodarstwa
    const usedMethods = [...new Set(items.map(i => String(i.method)))]
    const knownMethods = await prisma.plantingMethodDef.findMany({
      where: { tenantId, code: { in: usedMethods } },
      select: { code: true },
    })
    const unknown = usedMethods.filter(c => !knownMethods.some(k => k.code === c))
    if (unknown.length > 0) {
      return NextResponse.json({ error: `Nieznany sposób obsadzenia: ${unknown.join(', ')}` }, { status: 400 })
    }

    // sekcje muszą należeć do tenanta
    const sectionIds = [...new Set(items.map(i => String(i.sectionId)))]
    const owned = await prisma.section.findMany({
      where: { id: { in: sectionIds }, block: { farm: { tenantId } } },
      select: { id: true },
    })
    if (owned.length !== sectionIds.length) {
      return NextResponse.json({ error: 'Któraś z sekcji nie należy do tego gospodarstwa' }, { status: 403 })
    }

    const years = [...new Set(items.map(i => Number(i.year)))]

    await prisma.$transaction([
      prisma.plantingScenarioItem.deleteMany({ where: { scenarioId: id, year: { in: years } } }),
      prisma.plantingScenarioItem.createMany({
        data: items.map(raw => ({
          scenarioId: id,
          sectionId: String(raw.sectionId),
          year: Number(raw.year),
          method: String(raw.method),
          producesSummer: Boolean(raw.producesSummer),
          producesAutumn: Boolean(raw.producesAutumn),
          note: raw.note ? String(raw.note) : null,
        })),
      }),
    ])

    const updated = await prisma.plantingScenario.findFirst({
      where: { id, tenantId },
      include: { items: true, plugPlans: true },
    })
    return NextResponse.json({ scenario: updated })
  } catch (error) {
    console.error('Error saving scenario items:', error)
    const message = error instanceof Error ? error.message : 'Failed to save items'
    return NextResponse.json({ error: message }, { status: message.includes('Unauthorized') ? 401 : 500 })
  }
}
