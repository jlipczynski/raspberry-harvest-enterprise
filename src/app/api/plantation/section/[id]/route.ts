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
    
    // Only update fields that are explicitly present in the request body
    // This prevents wiping fields the frontend doesn't send
    const data: Record<string, unknown> = {}

    // Fields that use ?? null (preserve 0 as valid value)
    const nullishFields = [
      'name', 'metersLength', 'potsPerMeter', 'shootsPerPot',
      'yieldSummerPerShoot', 'yieldAutumnPerShoot',
      'gdhSummer', 'gdhAutumn', 'varietyId',
    ]
    for (const field of nullishFields) {
      if (field in body) data[field] = body[field] ?? null
    }

    // Fields that use || null (empty string → null)
    const orNullFields = [
      'plantingYear', 'productionYear', 'plantMaterialType',
      'plantSource', 'certificateUrl', 'deliveryProofUrl',
    ]
    for (const field of orNullFields) {
      if (field in body) data[field] = body[field] || null
    }

    // Special handling fields
    if ('potsOverride' in body) {
      data.potsOverride = body.potsOverride !== undefined && body.potsOverride !== null && body.potsOverride !== ''
        ? parseInt(String(body.potsOverride))
        : null
    }
    if ('winteredInTunnel' in body) data.winteredInTunnel = body.winteredInTunnel || false
    if ('plantingDate' in body) data.plantingDate = body.plantingDate ? new Date(body.plantingDate) : null
    if ('autumnShootDate' in body) data.autumnShootDate = body.autumnShootDate ? new Date(body.autumnShootDate) : null
    if ('harvestCurveSummer' in body) data.harvestCurveSummer = body.harvestCurveSummer || []
    if ('harvestCurveAutumn' in body) data.harvestCurveAutumn = body.harvestCurveAutumn || []

    const section = await prisma.section.update({
      where: { id },
      data,
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
