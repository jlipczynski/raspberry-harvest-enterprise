import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireTenantId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const tenantId = await requireTenantId()
    const body = await request.json()
    const { name, summer, autumn, productionYear, varietyId, winteredInTunnel, plantSource, productionCycle, sourceSectionId } = body
    if (!name?.trim()) return NextResponse.json({ error: 'Nazwa jest wymagana' }, { status: 400 })
    if (!summer?.dailyCurve && !autumn?.dailyCurve) {
      return NextResponse.json({ error: 'Przynajmniej jedna krzywa jest wymagana' }, { status: 400 })
    }
    const template = await prisma.productionCurveTemplate.create({
      data: {
        name: name.trim(),
        tenantId,
        productionYear: productionYear || new Date().getFullYear(),
        productionCycle: productionCycle || 1,
        winteredInTunnel: winteredInTunnel ?? false,
        plantSource: plantSource || null,
        varietyId: varietyId || null,
        sourceSectionId: sourceSectionId || null,
        tempSources: [],
        dailyCurveSummer: summer?.dailyCurve || [],
        weeklyCurveSummer: summer?.weeklyCurve || [],
        totalKgSummer: summer?.totalKg || 0,
        startWeekSummer: summer?.startWeek || null,
        startDateSummer: summer?.startDate || null,
        endDateSummer: summer?.endDate || null,
        dailyCurveAutumn: autumn?.dailyCurve || [],
        weeklyCurveAutumn: autumn?.weeklyCurve || [],
        totalKgAutumn: autumn?.totalKg || 0,
        startWeekAutumn: autumn?.startWeek || null,
        startDateAutumn: autumn?.startDate || null,
        endDateAutumn: autumn?.endDate || null,
      },
    })
    return NextResponse.json({ template })
  } catch (error) {
    console.error('Error creating template:', error)
    const message = error instanceof Error ? error.message : 'Failed to create template'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
