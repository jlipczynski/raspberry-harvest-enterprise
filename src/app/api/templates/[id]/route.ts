import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const template = await prisma.productionCurveTemplate.findUnique({
      where: { id }, include: { variety: true, sourceSection: { select: { id: true, name: true } }, sectionAssignments: { include: { section: true, harvestCurve: true } } },
    })
    if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ template })
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const data: Record<string, unknown> = {}
    const fields = ['name','description','productionYear','productionCycle','plantingDate',
      'winteredInTunnel','plantSource',
      'dailyCurveSummer','weeklyCurveSummer','startDateSummer','endDateSummer','startWeekSummer','totalKgSummer',
      'dailyCurveAutumn','weeklyCurveAutumn','startDateAutumn','endDateAutumn','startWeekAutumn','totalKgAutumn',
      'outsideTemps','insideTunnelTemps','tempAdjustmentFactor','gdhData','gdhToFlowering',
      'gdhToFirstFruit','tempSources','sourceFile','notes','summerEndWeek']
    fields.forEach(f => { if (body[f] !== undefined) data[f] = body[f] })
    if (body.varietyId !== undefined) {
      data.variety = body.varietyId ? { connect: { id: body.varietyId } } : { disconnect: true }
    }
    if (body.sourceSectionId !== undefined) {
      data.sourceSection = body.sourceSectionId ? { connect: { id: body.sourceSectionId } } : { disconnect: true }
    }
    const template = await prisma.productionCurveTemplate.update({
      where: { id }, data, include: { variety: true, sourceSection: { select: { id: true, name: true } } },
    })
    return NextResponse.json({ template })
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.productionCurveTemplate.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
