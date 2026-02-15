import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const tenantId = await requireTenantId()
    const varieties = await prisma.variety.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' }
    })
    return NextResponse.json({ varieties })
  } catch (error) {
    console.error('Error fetching varieties:', error)
    return NextResponse.json({ error: 'Failed to fetch varieties' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = await requireTenantId()
    const body = await request.json()
    const { variety } = body
    const newVariety = await prisma.variety.create({
      data: {
        name: variety.name,
        origin: variety.origin || null,
        description: variety.description || null,
        yieldSummerPerShoot: variety.yieldSummerPerShoot ? parseFloat(variety.yieldSummerPerShoot) : null,
        yieldAutumnPerShoot: variety.yieldAutumnPerShoot ? parseFloat(variety.yieldAutumnPerShoot) : null,
        baseTemp: variety.baseTemp ? parseFloat(variety.baseTemp) : 6.0,
        gdhWinteredFlower: variety.gdhWinteredFlower ? parseInt(variety.gdhWinteredFlower) : null,
        gdhWinteredFruit: variety.gdhWinteredFruit ? parseInt(variety.gdhWinteredFruit) : null,
        gdhLcFlower: variety.gdhLcFlower ? parseInt(variety.gdhLcFlower) : null,
        gdhLcFruit: variety.gdhLcFruit ? parseInt(variety.gdhLcFruit) : null,
        gdhAutumnFlower: variety.gdhAutumnFlower ? parseInt(variety.gdhAutumnFlower) : null,
        gdhAutumnFruit: variety.gdhAutumnFruit ? parseInt(variety.gdhAutumnFruit) : null,
        harvestCurveSummer: variety.harvestCurveSummer || [],
        harvestCurveAutumn: variety.harvestCurveAutumn || [],
        pickingEfficiency: variety.pickingEfficiency ? parseFloat(variety.pickingEfficiency) : null,
        firstCategoryPercent: variety.firstCategoryPercent ? parseFloat(variety.firstCategoryPercent) : null,
        secondCategoryPercent: variety.secondCategoryPercent ? parseFloat(variety.secondCategoryPercent) : null,
        tenantId,
      }
    })
    return NextResponse.json({ variety: newVariety })
  } catch (error) {
    console.error('Error creating variety:', error)
    return NextResponse.json({ error: 'Failed to create variety' }, { status: 500 })
  }
}
