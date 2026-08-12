import { prisma } from '@/lib/prisma'
import { requireTenantId } from '@/lib/tenant'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/** GET — lista scenariuszy tenanta wraz z pozycjami (potrzebne do porównania A/B/C). */
export async function GET() {
  try {
    const tenantId = await requireTenantId()
    const scenarios = await prisma.plantingScenario.findMany({
      where: { tenantId, isArchived: false },
      include: { items: true, plugPlans: true },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json({ scenarios })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch scenarios'
    return NextResponse.json({ error: message }, { status: message.includes('Unauthorized') ? 401 : 500 })
  }
}

/**
 * POST — nowy scenariusz.
 * body: { name, description?, startYear, endYear, cloneFromId? }
 * cloneFromId kopiuje decyzje i plan plag — odpowiednik duplikowania arkusza w Excelu.
 */
export async function POST(request: NextRequest) {
  try {
    const tenantId = await requireTenantId()
    const body = await request.json()

    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'Nazwa scenariusza jest wymagana' }, { status: 400 })
    }
    const startYear = Number(body.startYear)
    const endYear = Number(body.endYear)
    if (!Number.isInteger(startYear) || !Number.isInteger(endYear)) {
      return NextResponse.json({ error: 'Zakres lat jest wymagany' }, { status: 400 })
    }
    if (endYear < startYear) {
      return NextResponse.json({ error: 'Rok końcowy nie może być wcześniejszy niż początkowy' }, { status: 400 })
    }

    let items: { sectionId: string; year: number; method: string; producesSummer: boolean; producesAutumn: boolean; note: string | null }[] = []
    let plugPlans: { varietyId: string; year: number; quantity: number }[] = []

    if (body.cloneFromId) {
      const source = await prisma.plantingScenario.findFirst({
        where: { id: String(body.cloneFromId), tenantId },
        include: { items: true, plugPlans: true },
      })
      if (!source) return NextResponse.json({ error: 'Nie znaleziono scenariusza do sklonowania' }, { status: 404 })
      items = source.items.map(i => ({
        sectionId: i.sectionId, year: i.year, method: i.method,
        producesSummer: i.producesSummer, producesAutumn: i.producesAutumn, note: i.note,
      }))
      plugPlans = source.plugPlans.map(p => ({ varietyId: p.varietyId, year: p.year, quantity: p.quantity }))
    }

    const scenario = await prisma.plantingScenario.create({
      data: {
        tenantId,
        name: body.name.trim(),
        description: body.description ? String(body.description) : null,
        startYear,
        endYear,
        items: items.length > 0 ? { create: items } : undefined,
        plugPlans: plugPlans.length > 0 ? { create: plugPlans } : undefined,
      },
      include: { items: true, plugPlans: true },
    })
    return NextResponse.json({ scenario })
  } catch (error) {
    console.error('Error creating scenario:', error)
    const message = error instanceof Error ? error.message : 'Failed to create scenario'
    return NextResponse.json({ error: message }, { status: message.includes('Unauthorized') ? 401 : 500 })
  }
}
