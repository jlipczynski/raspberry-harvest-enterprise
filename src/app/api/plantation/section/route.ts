import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { section } = body

    const newSection = await prisma.section.create({
      data: {
        name: section.name,
        metersLength: section.metersLength,
        potsPerMeter: section.potsPerMeter,
        shootsPerPot: section.shootsPerPot,
        plantingYear: section.plantingYear || null,
        productionYear: section.productionYear || null,
        plantMaterialType: section.plantMaterialType || null,
        yieldSummerPerShoot: section.yieldSummerPerShoot || null,
        yieldAutumnPerShoot: section.yieldAutumnPerShoot || null,
        gdhSummer: section.gdhSummer || null,
        gdhAutumn: section.gdhAutumn || null,
        blockId: section.blockId,
        varietyId: section.varietyId,
        winteredInTunnel: section.winteredInTunnel || false,
        plantingDate: section.plantingDate ? new Date(section.plantingDate) : null,
        winterShootsDate: section.winterShootsDate ? new Date(section.winterShootsDate) : null,
      }
    })

    return NextResponse.json({ section: newSection })
  } catch (error) {
    console.error('Error creating section:', error)
    return NextResponse.json({ error: 'Failed to create section' }, { status: 500 })
  }
}
