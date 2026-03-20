import { requireTenantId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const where: Record<string, unknown> = {}
    if (searchParams.get('varietyId')) where.varietyId = searchParams.get('varietyId')
    if (searchParams.get('cycle')) where.productionCycle = parseInt(searchParams.get('cycle')!)
    if (searchParams.get('tunnel')) where.winteredInTunnel = searchParams.get('tunnel') === 'true'
    const templates = await prisma.productionCurveTemplate.findMany({
      where, include: { tenant: { select: { name: true } }, variety: { select: { id: true, name: true, baseTemp: true, gdhSummer: true, gdhAutumn: true, gdhWinteredFlower: true, gdhWinteredFruit: true, gdhLcFlower: true, gdhLcFruit: true, gdhAutumnFlower: true, gdhAutumnFruit: true } }, sourceSection: { select: { id: true, name: true } }, _count: { select: { sectionAssignments: true } } },
      orderBy: [{ productionYear: 'desc' }, { name: 'asc' }],
    })
    // Add backward-compatible fields for planning/page.tsx
    const templatesWithCompat = templates.map(t => ({
      ...t,
      season: t.totalKgSummer >= t.totalKgAutumn ? 'summer' : 'autumn',
      dailyCurve: t.dailyCurveSummer.length > 0 ? t.dailyCurveSummer : t.dailyCurveAutumn,
      weeklyCurve: t.weeklyCurveSummer.length > 0 ? t.weeklyCurveSummer : t.weeklyCurveAutumn,
      totalKg: t.totalKgSummer + t.totalKgAutumn,
      startWeek: t.startWeekSummer || t.startWeekAutumn,
    }))
    return NextResponse.json({ templates: templatesWithCompat })
  } catch (error) {
    console.error('Error fetching templates:', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = await requireTenantId()
    const body = await request.json()

    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json({ error: 'Nazwa szablonu jest wymagana' }, { status: 400 })
    }
    if (!body.productionYear || typeof body.productionYear !== 'number') {
      return NextResponse.json({ error: 'Rok produkcji jest wymagany' }, { status: 400 })
    }

    const data: Record<string, unknown> = {
      name: body.name, description: body.description || null, tenantId,
      productionYear: body.productionYear, productionCycle: body.productionCycle || 1,
      plantingDate: body.plantingDate || null,
      winteredInTunnel: body.winteredInTunnel || false, plantSource: body.plantSource || null,
      dailyCurveSummer: body.dailyCurveSummer || [], weeklyCurveSummer: body.weeklyCurveSummer || [],
      startDateSummer: body.startDateSummer || null, endDateSummer: body.endDateSummer || null,
      startWeekSummer: body.startWeekSummer ?? null, totalKgSummer: body.totalKgSummer ?? 0,
      dailyCurveAutumn: body.dailyCurveAutumn || [], weeklyCurveAutumn: body.weeklyCurveAutumn || [],
      startDateAutumn: body.startDateAutumn || null, endDateAutumn: body.endDateAutumn || null,
      startWeekAutumn: body.startWeekAutumn ?? null, totalKgAutumn: body.totalKgAutumn ?? 0,
      outsideTemps: body.outsideTemps || null, insideTunnelTemps: body.insideTunnelTemps || null,
      tempAdjustmentFactor: body.tempAdjustmentFactor || null,
      gdhData: body.gdhData || null, gdhToFlowering: body.gdhToFlowering || null,
      gdhToFirstFruit: body.gdhToFirstFruit || null, tempSources: body.tempSources || [],
      sourceFile: body.sourceFile || null, notes: body.notes || null,
    }
    if (body.varietyId) data.varietyId = body.varietyId
    if (body.sourceSectionId) data.sourceSectionId = body.sourceSectionId
    const template = await prisma.productionCurveTemplate.create({
      data: data as Parameters<typeof prisma.productionCurveTemplate.create>[0]['data'], include: { tenant: { select: { name: true } }, variety: { select: { id: true, name: true, baseTemp: true, gdhSummer: true, gdhAutumn: true, gdhWinteredFlower: true, gdhWinteredFruit: true, gdhLcFlower: true, gdhLcFruit: true, gdhAutumnFlower: true, gdhAutumnFruit: true } }, sourceSection: { select: { id: true, name: true } } },
    })
    return NextResponse.json({ template })
  } catch (error) {
    console.error('Error creating template:', error)
    const message = error instanceof Error ? error.message : 'Failed to create'
    if (message.includes('Unauthorized')) {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
