import { prisma } from '@/lib/prisma'
import { requireTenantId } from '@/lib/tenant'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * PUT — plan produkcji plag.
 * body: { plugPlans: [{ year, varietyId, quantity }] }
 * Zastępuje plan dla przesłanych lat.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenantId = await requireTenantId()
    const { id } = await params
    const body = await request.json()

    const scenario = await prisma.plantingScenario.findFirst({ where: { id, tenantId } })
    if (!scenario) return NextResponse.json({ error: 'Nie znaleziono scenariusza' }, { status: 404 })

    if (!Array.isArray(body.plugPlans)) {
      return NextResponse.json({ error: 'Pole plugPlans jest wymagane' }, { status: 400 })
    }

    const plans = (body.plugPlans as Record<string, unknown>[]).filter(p => Number(p.quantity) > 0)
    for (const raw of plans) {
      if (!raw.varietyId || !Number.isInteger(Number(raw.year))) {
        return NextResponse.json({ error: 'Każdy plan plag wymaga varietyId i year' }, { status: 400 })
      }
    }

    const varietyIds = [...new Set(plans.map(p => String(p.varietyId)))]
    if (varietyIds.length > 0) {
      const owned = await prisma.variety.findMany({
        where: { id: { in: varietyIds }, tenantId },
        select: { id: true },
      })
      if (owned.length !== varietyIds.length) {
        return NextResponse.json({ error: 'Któraś z odmian nie należy do tego gospodarstwa' }, { status: 403 })
      }
    }

    const years = [...new Set((body.plugPlans as Record<string, unknown>[]).map(p => Number(p.year)))]

    await prisma.$transaction([
      prisma.scenarioPlugPlan.deleteMany({ where: { scenarioId: id, year: { in: years } } }),
      prisma.scenarioPlugPlan.createMany({
        data: plans.map(raw => ({
          scenarioId: id,
          varietyId: String(raw.varietyId),
          year: Number(raw.year),
          quantity: Math.round(Number(raw.quantity)),
        })),
      }),
    ])

    const updated = await prisma.plantingScenario.findFirst({
      where: { id, tenantId },
      include: { items: true, plugPlans: true },
    })
    return NextResponse.json({ scenario: updated })
  } catch (error) {
    console.error('Error saving plug plans:', error)
    const message = error instanceof Error ? error.message : 'Failed to save plug plans'
    return NextResponse.json({ error: message }, { status: message.includes('Unauthorized') ? 401 : 500 })
  }
}
