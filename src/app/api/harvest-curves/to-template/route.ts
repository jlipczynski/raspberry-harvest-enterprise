import { requireTenantId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const tenantId = await requireTenantId()

    const body = await request.json()
    const {
      name,
      season,
      dailyCurve,
      weeklyCurve,
      totalKg,
      productionYear,
      startWeek,
      sourceAreaNames,
      varietyId,
      winteredInTunnel,
      plantSource,
      productionCycle,
    } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Nazwa jest wymagana' }, { status: 400 })
    }
    if (!season) {
      return NextResponse.json({ error: 'Sezon jest wymagany' }, { status: 400 })
    }
    if (!dailyCurve || !Array.isArray(dailyCurve)) {
      return NextResponse.json({ error: 'dailyCurve jest wymagane' }, { status: 400 })
    }

    const template = await prisma.productionCurveTemplate.create({
      data: {
        name: name.trim(),
        tenantId,
        season,
        dailyCurve: dailyCurve || [],
        weeklyCurve: weeklyCurve || [],
        totalKg: totalKg || 0,
        productionYear: productionYear || new Date().getFullYear(),
        startWeek: startWeek || 23,
        productionCycle: productionCycle || 1,
        winteredInTunnel: winteredInTunnel ?? false,
        plantSource: plantSource || null,
        varietyId: varietyId || null,
        sourceAreaNames: sourceAreaNames || [],
        tempSources: [],
      },
    })

    return NextResponse.json({ template })
  } catch (error) {
    console.error('Error creating template:', error)
    const message = error instanceof Error ? error.message : 'Failed to create template'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
