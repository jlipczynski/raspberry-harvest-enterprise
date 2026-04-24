import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const tenantId = await requireTenantId()
    const farm = await prisma.farm.findFirst({
      where: { tenantId },
      include: {
        blocks: {
          include: {
            sections: {
              include: {
                variety: true,
                _count: {
                  select: { temperatureReadings: true }
                },
                templateAssignments: {
                  where: { isActive: true },
                  include: { template: { select: { id: true, name: true, weeklyCurveSummer: true, dailyCurveSummer: true, startWeekSummer: true, startDateSummer: true, totalKgSummer: true, weeklyCurveAutumn: true, dailyCurveAutumn: true, startWeekAutumn: true, startDateAutumn: true, totalKgAutumn: true } } },
                  orderBy: { createdAt: 'desc' as const },
                },
              }
            }
          },
          orderBy: { name: 'asc' }
        }
      }
    })

    if (!farm) {
      return NextResponse.json({ blocks: [], farm: null, varieties: [] })
    }

    const varieties = await prisma.variety.findMany({ orderBy: { name: 'asc' } })
    return NextResponse.json({ blocks: farm.blocks, varieties, farm })
  } catch (error) {
    console.error('Error fetching plantation data:', error)
    return NextResponse.json({ error: 'Failed to fetch plantation data' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = await requireTenantId()
    const body = await request.json()
    let farm = await prisma.farm.findFirst({ where: { tenantId } })
    if (!farm) {
      farm = await prisma.farm.create({ data: { name: body.name || 'Moja plantacja', tenantId } })
    }
    if (body.block) {
      const block = await prisma.block.create({
        data: { name: body.block.name, farmId: farm.id },
        include: { sections: true }
      })
      return NextResponse.json({ block, farm })
    }
    return NextResponse.json({ farm })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
