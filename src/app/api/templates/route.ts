import { requireTenantId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const where: Record<string, unknown> = {}
    if (searchParams.get('varietyId')) where.varietyId = searchParams.get('varietyId')
    if (searchParams.get('season')) where.season = searchParams.get('season')
    if (searchParams.get('cycle')) where.productionCycle = parseInt(searchParams.get('cycle')!)
    if (searchParams.get('tunnel')) where.winteredInTunnel = searchParams.get('tunnel') === 'true'
    const templates = await prisma.productionCurveTemplate.findMany({
      where, include: { tenant: { select: { name: true } }, variety: { select: { id: true, name: true, baseTemp: true, gdhSummer: true, gdhAutumn: true, gdhWinteredFlower: true, gdhWinteredFruit: true, gdhLcFlower: true, gdhLcFruit: true, gdhAutumnFlower: true, gdhAutumnFruit: true } }, _count: { select: { sectionAssignments: true } } },
      orderBy: [{ productionYear: 'desc' }, { name: 'asc' }],
    })
    return NextResponse.json({ templates })
  } catch (error) {
    console.error('Error fetching templates:', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data: Record<string, unknown> = {
      name: body.name, description: body.description || null, tenantId: await requireTenantId(),
      productionYear: body.productionYear, productionCycle: body.productionCycle || 1,
      season: body.season, plantingDate: body.plantingDate || null,
      winteredInTunnel: body.winteredInTunnel || false, plantSource: body.plantSource || null,
      dailyCurve: body.dailyCurve || [], weeklyCurve: body.weeklyCurve || [],
      startDate: body.startDate || null, endDate: body.endDate || null,
      startWeek: body.startWeek || null, totalKg: body.totalKg || 0,
      outsideTemps: body.outsideTemps || null, insideTunnelTemps: body.insideTunnelTemps || null,
      tempAdjustmentFactor: body.tempAdjustmentFactor || null,
      gdhData: body.gdhData || null, gdhToFlowering: body.gdhToFlowering || null,
      gdhToFirstFruit: body.gdhToFirstFruit || null, tempSources: body.tempSources || [],
      sourceFile: body.sourceFile || null, notes: body.notes || null,
    }
    if (body.varietyId) data.variety = { connect: { id: body.varietyId } }
    const template = await prisma.productionCurveTemplate.create({
      data, include: { tenant: { select: { name: true } }, variety: { select: { id: true, name: true, baseTemp: true, gdhSummer: true, gdhAutumn: true, gdhWinteredFlower: true, gdhWinteredFruit: true, gdhLcFlower: true, gdhLcFruit: true, gdhAutumnFlower: true, gdhAutumnFruit: true } } },
    })
    return NextResponse.json({ template })
  } catch (error) {
    console.error('Error creating template:', error)
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  }
}
