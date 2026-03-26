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
    const nullishFields = [
      'name', 'yieldSummerPerShoot', 'yieldAutumnPerShoot',
      'baseTemp',
      // GDH progi — LATO
      'gdhWinteredFlowerSummer', 'gdhWinteredFruitSummer',
      'gdhPlantedFlowerSummer', 'gdhPlantedFruitSummer',
      'gdhLcFlowerSummer', 'gdhLcFruitSummer',
      // GDH próg — JESIEŃ
      'gdhFruitAutumn',
      'pickingEfficiency',
      'wastePercent', 'secondCategoryPercent',
    ]
    for (const field of nullishFields) {
      if (field in body) data[field] = body[field] ?? null
    }
    const orNullFields = ['origin', 'description']
    for (const field of orNullFields) {
      if (field in body) data[field] = body[field] || null
    }
    const arrayFields = ['harvestCurveSummer', 'harvestCurveAutumn']
    for (const field of arrayFields) {
      if (field in body) data[field] = body[field] || null
    }

    const variety = await prisma.variety.update({
      where: { id },
      data,
    })

    return NextResponse.json({ variety })
  } catch (error) {
    console.error('Error updating variety:', error)
    return NextResponse.json({ error: 'Failed to update variety' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    // Check if variety has sections
    const sectionsCount = await prisma.section.count({
      where: { varietyId: id }
    })
    
    if (sectionsCount > 0) {
      return NextResponse.json(
        { error: `Nie można usunąć odmiany - jest używana w ${sectionsCount} sekcjach` },
        { status: 400 }
      )
    }
    
    await prisma.variety.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting variety:', error)
    return NextResponse.json({ error: 'Failed to delete variety' }, { status: 500 })
  }
}
