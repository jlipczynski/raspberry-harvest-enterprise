import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    
    const section = await prisma.section.update({
      where: { id },
      data: {
        name: body.name,
        metersLength: body.metersLength,
        potsPerMeter: body.potsPerMeter,
        shootsPerPot: body.shootsPerPot,
        plantingYear: body.plantingYear || null,
        productionYear: body.productionYear || null,
        plantMaterialType: body.plantMaterialType || null,
        yieldSummerPerShoot: body.yieldSummerPerShoot ?? null,
        yieldAutumnPerShoot: body.yieldAutumnPerShoot ?? null,
        gdhSummer: body.gdhSummer ?? null,
        gdhAutumn: body.gdhAutumn ?? null,
        varietyId: body.varietyId,
        certificateUrl: body.certificateUrl || null,
        deliveryProofUrl: body.deliveryProofUrl || null,
        winteredInTunnel: body.winteredInTunnel || false,
        plantingDate: body.plantingDate ? new Date(body.plantingDate) : null,
        winterShootsDate: body.winterShootsDate ? new Date(body.winterShootsDate) : null,
        harvestCurveSummer: body.harvestCurveSummer || [],
        harvestCurveAutumn: body.harvestCurveAutumn || [],
      }
    })

    return NextResponse.json({ section })
  } catch (error) {
    console.error('Error updating section:', error)
    return NextResponse.json({ error: 'Failed to update section' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    await prisma.section.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting section:', error)
    return NextResponse.json({ error: 'Failed to delete section' }, { status: 500 })
  }
}
