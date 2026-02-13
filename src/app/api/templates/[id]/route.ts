import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const template = await prisma.productionCurveTemplate.findUnique({
      where: { id }, include: { variety: true, sectionAssignments: { include: { section: true } } },
    })
    if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ template })
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const data: any = {}
    const fields = ['name','description','productionYear','productionCycle','season','plantingDate',
      'winteredInTunnel','plantSource','dailyCurve','weeklyCurve','startDate','endDate','startWeek',
      'totalKg','outsideTemps','insideTunnelTemps','tempAdjustmentFactor','gdhData','gdhToFlowering',
      'gdhToFirstFruit','tempSources','sourceFile','notes']
    fields.forEach(f => { if (body[f] !== undefined) data[f] = body[f] })
    if (body.varietyId !== undefined) {
      data.variety = body.varietyId ? { connect: { id: body.varietyId } } : { disconnect: true }
    }
    const template = await prisma.productionCurveTemplate.update({
      where: { id }, data, include: { variety: true },
    })
    return NextResponse.json({ template })
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.productionCurveTemplate.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
