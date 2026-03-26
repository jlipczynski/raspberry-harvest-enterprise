import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Varieties are GLOBAL - shared across all tenants
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
    const newVariety = await prisma.variety.create({
      data: {
        name: variety.name,
        origin: variety.origin || null,
        description: variety.description || null,
        yieldSummerPerShoot: variety.yieldSummerPerShoot != null ? parseFloat(variety.yieldSummerPerShoot) : null,
        yieldAutumnPerShoot: variety.yieldAutumnPerShoot != null ? parseFloat(variety.yieldAutumnPerShoot) : null,
        baseTemp: variety.baseTemp != null ? parseFloat(variety.baseTemp) : 6.0,
        // GDH progi — LATO
        gdhWinteredFlowerSummer: variety.gdhWinteredFlowerSummer != null ? parseInt(variety.gdhWinteredFlowerSummer) : null,
        gdhWinteredFruitSummer: variety.gdhWinteredFruitSummer != null ? parseInt(variety.gdhWinteredFruitSummer) : null,
        gdhPlantedFlowerSummer: variety.gdhPlantedFlowerSummer != null ? parseInt(variety.gdhPlantedFlowerSummer) : null,
        gdhPlantedFruitSummer: variety.gdhPlantedFruitSummer != null ? parseInt(variety.gdhPlantedFruitSummer) : null,
        gdhLcFlowerSummer: variety.gdhLcFlowerSummer != null ? parseInt(variety.gdhLcFlowerSummer) : null,
        gdhLcFruitSummer: variety.gdhLcFruitSummer != null ? parseInt(variety.gdhLcFruitSummer) : null,
        // GDH progi — JESIEŃ
        gdhWinteredFlowerAutumn: variety.gdhWinteredFlowerAutumn != null ? parseInt(variety.gdhWinteredFlowerAutumn) : null,
        gdhWinteredFruitAutumn: variety.gdhWinteredFruitAutumn != null ? parseInt(variety.gdhWinteredFruitAutumn) : null,
        gdhPlantedFlowerAutumn: variety.gdhPlantedFlowerAutumn != null ? parseInt(variety.gdhPlantedFlowerAutumn) : null,
        gdhPlantedFruitAutumn: variety.gdhPlantedFruitAutumn != null ? parseInt(variety.gdhPlantedFruitAutumn) : null,
        gdhLcFlowerAutumn: variety.gdhLcFlowerAutumn != null ? parseInt(variety.gdhLcFlowerAutumn) : null,
        gdhLcFruitAutumn: variety.gdhLcFruitAutumn != null ? parseInt(variety.gdhLcFruitAutumn) : null,
        harvestCurveSummer: variety.harvestCurveSummer || [],
        harvestCurveAutumn: variety.harvestCurveAutumn || [],
        pickingEfficiency: variety.pickingEfficiency != null ? parseFloat(variety.pickingEfficiency) : null,
        wastePercent: variety.wastePercent != null ? parseFloat(variety.wastePercent) : null,
        secondCategoryPercent: variety.secondCategoryPercent != null ? parseFloat(variety.secondCategoryPercent) : null,
      }
    })
    return NextResponse.json({ variety: newVariety })
  } catch (error) {
    console.error('Error creating variety:', error)
    return NextResponse.json({ error: 'Failed to create variety' }, { status: 500 })
  }
}
