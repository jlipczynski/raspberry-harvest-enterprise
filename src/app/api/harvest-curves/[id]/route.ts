import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const curve = await prisma.harvestCurve.update({
      where: { id },
      data: {
        ...(body.year !== undefined && { year: body.year }),
        ...(body.season !== undefined && { season: body.season }),
        ...(body.curve !== undefined && { curve: body.curve }),
        ...(body.totalKg !== undefined && { totalKg: body.totalKg }),
        ...(body.startWeek !== undefined && { startWeek: body.startWeek }),
        ...(body.sectionId !== undefined && { sectionId: body.sectionId || null }),
        ...(body.varietyId !== undefined && { varietyId: body.varietyId || null }),
        ...(body.commercialStartDate !== undefined && { commercialStartDate: body.commercialStartDate ? new Date(body.commercialStartDate) : null }),
        ...(body.commercialStartDateAutumn !== undefined && { commercialStartDateAutumn: body.commercialStartDateAutumn ? new Date(body.commercialStartDateAutumn) : null }),
        ...(body.winteredInTunnel !== undefined && { winteredInTunnel: body.winteredInTunnel }),
        ...(body.plantingDate !== undefined && { plantingDate: body.plantingDate ? new Date(body.plantingDate) : null }),
        ...(body.plantSource !== undefined && { plantSource: body.plantSource || null }),
        ...(body.plantingYear !== undefined && { plantingYear: body.plantingYear }),
        ...(body.autumnShootDate !== undefined && { autumnShootDate: body.autumnShootDate ? new Date(body.autumnShootDate) : null }),
      },
      include: {
        section: { select: { id: true, name: true } },
        variety: { select: { id: true, name: true } },
      },
    })
    return NextResponse.json({ curve })
  } catch (error) {
    console.error('Error updating harvest curve:', error)
    return NextResponse.json({ error: 'Failed to update harvest curve' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await prisma.harvestCurve.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting harvest curve:', error)
    return NextResponse.json({ error: 'Failed to delete harvest curve' }, { status: 500 })
  }
}
