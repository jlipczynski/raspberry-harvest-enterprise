import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

    if (!name || !season || !dailyCurve || !totalKg) {
      return NextResponse.json({ error: 'Missing required fields: name, season, dailyCurve, totalKg' }, { status: 400 })
    }

    // Pobierz tenantId z sesji
    const tenantId = (session.user as { tenantId?: string }).tenantId
    if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

    const template = await prisma.productionCurveTemplate.create({
      data: {
        name,
        season,
        dailyCurve: dailyCurve || [],
        weeklyCurve: weeklyCurve || [],
        totalKg: totalKg || 0,
        productionYear: productionYear || new Date().getFullYear(),
        startWeek: startWeek || 23,
        sourceAreaNames: sourceAreaNames || [],
        varietyId: varietyId || null,
        winteredInTunnel: winteredInTunnel ?? false,
        plantSource: plantSource || null,
        productionCycle: productionCycle || 1,
        tenantId,
      }
    })

    return NextResponse.json({ template })
  } catch (error) {
    console.error('Error creating template from areas:', error)
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
  }
}
