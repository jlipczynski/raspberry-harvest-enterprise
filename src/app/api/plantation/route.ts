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
                templateAssignments: {
                  where: { isActive: true },
                  include: { template: { select: { id: true, name: true, season: true, weeklyCurve: true, dailyCurve: true, startWeek: true, totalKg: true } } },
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
    return NextResponse.json({ farm })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
