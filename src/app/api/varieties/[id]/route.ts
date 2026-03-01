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
    
    const variety = await prisma.variety.update({
      where: { id },
      data: {
        name: body.name,
        origin: body.origin || null,
        description: body.description || null,
        yieldSummerPerShoot: body.yieldSummerPerShoot ?? null,
        yieldAutumnPerShoot: body.yieldAutumnPerShoot ?? null,
        gdhSummer: body.gdhSummer ?? null,
        gdhAutumn: body.gdhAutumn ?? null,
        baseTemp: body.baseTemp ?? null,
        gdhWinteredFlower: body.gdhWinteredFlower ?? null,
        gdhWinteredFruit: body.gdhWinteredFruit ?? null,
        gdhLcFlower: body.gdhLcFlower ?? null,
        gdhLcFruit: body.gdhLcFruit ?? null,
        gdhAutumnFlower: body.gdhAutumnFlower ?? null,
        gdhAutumnFruit: body.gdhAutumnFruit ?? null,
        harvestCurveSummer: body.harvestCurveSummer || null,
        harvestCurveAutumn: body.harvestCurveAutumn || null,
        pickingEfficiency: body.pickingEfficiency ?? null,
        wastePercent: body.wastePercent ?? null,
        secondCategoryPercent: body.secondCategoryPercent ?? null,
      }
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
