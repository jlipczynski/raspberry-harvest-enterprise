import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTenantId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

/**
 * GET — returns planned harvest kg per block.
 * Formula per section: pots × shootsPerPot × yieldPerShoot
 * pots = potsOverride > 0 ? potsOverride : metersLength × potsPerMeter
 * yieldPerShoot = section.yieldSummerPerShoot ?? variety.yieldSummerPerShoot ?? 0
 * Aggregated to block level.
 */
export async function GET() {
  try {
    const tenantId = await requireTenantId()
    const farm = await prisma.farm.findFirst({
      where: { tenantId },
      include: {
        blocks: {
          include: {
            sections: {
              include: {
                variety: {
                  select: {
                    yieldSummerPerShoot: true,
                    yieldAutumnPerShoot: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!farm) return NextResponse.json({ blocks: [] })

    const blocks = farm.blocks.map(block => {
      let plannedSummerKg = 0
      let plannedAutumnKg = 0

      for (const section of block.sections) {
        const pots = (section.potsOverride && section.potsOverride > 0)
          ? section.potsOverride
          : section.metersLength * section.potsPerMeter

        const shoots = pots * section.shootsPerPot

        const yieldSummer = section.yieldSummerPerShoot
          ?? section.variety?.yieldSummerPerShoot
          ?? 0
        const yieldAutumn = section.yieldAutumnPerShoot
          ?? section.variety?.yieldAutumnPerShoot
          ?? 0

        plannedSummerKg += shoots * yieldSummer
        plannedAutumnKg += shoots * yieldAutumn
      }

      return {
        blockId: block.id,
        blockName: block.name,
        plannedKg: Math.round((plannedSummerKg + plannedAutumnKg) * 100) / 100,
        plannedSummerKg: Math.round(plannedSummerKg * 100) / 100,
        plannedAutumnKg: Math.round(plannedAutumnKg * 100) / 100,
        sectionCount: block.sections.length,
      }
    })

    return NextResponse.json({ blocks })
  } catch (error) {
    console.error('Harvest plan error:', error)
    return NextResponse.json({ error: 'Failed to calculate plan' }, { status: 500 })
  }
}
