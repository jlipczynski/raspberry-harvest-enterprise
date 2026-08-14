import { prisma } from '@/lib/prisma'
import { requireTenantId } from '@/lib/tenant'
import { NextResponse } from 'next/server'
import { resolveCanesPerPot, type StrategySection } from '@/lib/strategy'

export const dynamic = 'force-dynamic'

/**
 * GET — sekcje w formie wejściowej dla silnika strategii.
 * Plon: override sekcji, a gdy brak — wartość z odmiany. Brak obu = null (silnik zgłosi brak).
 */
export async function GET() {
  try {
    const tenantId = await requireTenantId()
    const sections = await prisma.section.findMany({
      where: { block: { farm: { tenantId } } },
      include: {
        variety: { select: { id: true, name: true, yieldSummerPerShoot: true, yieldAutumnPerShoot: true, wastePercent: true, canesPerPot: true } },
        block: { select: { id: true, name: true } },
      },
      orderBy: [{ block: { name: 'asc' } }, { name: 'asc' }],
    })

    const result: StrategySection[] = sections.map(s => ({
      id: s.id,
      name: s.name,
      blockName: s.block?.name ?? null,
      metersLength: s.metersLength,
      potsPerMeter: s.potsPerMeter,
      // liczba canów na doniczkę to cecha odmiany; sekcja jest wartością zapasową
      shootsPerPot: resolveCanesPerPot(s.variety?.canesPerPot, s.shootsPerPot),
      potsOverride: s.potsOverride,
      varietyId: s.varietyId,
      varietyName: s.variety?.name ?? null,
      yieldSummerPerShoot: s.yieldSummerPerShoot ?? s.variety?.yieldSummerPerShoot ?? null,
      yieldAutumnPerShoot: s.yieldAutumnPerShoot ?? s.variety?.yieldAutumnPerShoot ?? null,
      wastePercent: s.variety?.wastePercent ?? null,
    }))

    return NextResponse.json({ sections: result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch sections'
    return NextResponse.json({ error: message }, { status: message.includes('Unauthorized') ? 401 : 500 })
  }
}
