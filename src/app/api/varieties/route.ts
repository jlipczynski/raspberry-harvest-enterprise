import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const varieties = await prisma.variety.findMany({ 
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
    const body = await request.json()
    const { variety } = body

    // Get tenant
    const tenant = await prisma.tenant.findFirst()
    
    const newVariety = await prisma.variety.create({
      data: {
        name: variety.name,
        origin: variety.origin || null,
        description: variety.description || null,
        yieldSummerPerShoot: variety.yieldSummerPerShoot || null,
        yieldAutumnPerShoot: variety.yieldAutumnPerShoot || null,
        gdhSummer: variety.gdhSummer || null,
        gdhAutumn: variety.gdhAutumn || null,
        baseTemp: variety.baseTemp || null,
        gdhWinteredFlower: variety.gdhWinteredFlower || null,
        gdhWinteredFruit: variety.gdhWinteredFruit || null,
        gdhLcFlower: variety.gdhLcFlower || null,
        gdhLcFruit: variety.gdhLcFruit || null,
        gdhAutumnFlower: variety.gdhAutumnFlower || null,
        gdhAutumnFruit: variety.gdhAutumnFruit || null,
        harvestCurveSummer: variety.harvestCurveSummer || null,
        harvestCurveAutumn: variety.harvestCurveAutumn || null,
        pickingEfficiency: variety.pickingEfficiency || null,
        wastePercent: variety.wastePercent || null,
        secondCategoryPercent: variety.secondCategoryPercent || null,
        isCustom: true,
        tenantId: tenant?.id || null,
      }
    })

    return NextResponse.json({ variety: newVariety })
  } catch (error) {
    console.error('Error creating variety:', error)
    return NextResponse.json({ error: 'Failed to create variety' }, { status: 500 })
  }
}
