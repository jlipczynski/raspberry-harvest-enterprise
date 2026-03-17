import { requireTenantId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
export const dynamic = 'force-dynamic'

const getWeekNumber = (date: Date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const tenantId = await requireTenantId()

    const body = await request.json()
    const {
      curveIds,
      name,
      varietyId,
      season: overrideSeason,
      winteredInTunnel,
      plantSource,
      productionCycle,
      productionYear,
      plantingDate,
    } = body as {
      curveIds: string[]
      name: string
      varietyId?: string
      season?: string
      winteredInTunnel?: boolean
      plantSource?: string
      productionCycle?: number
      productionYear?: number
      plantingDate?: string
    }

    if (!curveIds || curveIds.length < 1) {
      return NextResponse.json({ error: 'Minimum 1 krzywa wymagana' }, { status: 400 })
    }
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Nazwa jest wymagana' }, { status: 400 })
    }

    const curves = await prisma.harvestCurve.findMany({
      where: { id: { in: curveIds } },
      include: {
        section: { select: { id: true, name: true } },
        variety: { select: { id: true, name: true } },
      },
    })

    if (curves.length === 0) {
      return NextResponse.json({ error: 'Nie znaleziono krzywych' }, { status: 404 })
    }

    // Validate same season if multiple curves
    if (curves.length > 1) {
      const seasons = new Set(curves.map(c => c.season))
      if (seasons.size > 1) {
        return NextResponse.json({ error: 'Wszystkie krzywe muszą mieć ten sam sezon' }, { status: 400 })
      }
    }

    // Merge or use single curve's dailyCurve
    let mergedDaily: number[]
    let startDate: string | null = null

    if (curves.length === 1) {
      const c = curves[0]
      mergedDaily = (c.dailyCurve || []) as number[]
      startDate = c.startDate
    } else {
      // Merge: align by date
      const allDailyMap: Record<string, number> = {}
      for (const curve of curves) {
        if (curve.dailyCurve && curve.startDate) {
          const daily = curve.dailyCurve as number[]
          daily.forEach((kg, i) => {
            const d = new Date(curve.startDate!)
            d.setDate(d.getDate() + i)
            const ds = d.toISOString().split('T')[0]
            allDailyMap[ds] = (allDailyMap[ds] || 0) + kg
          })
        } else {
          // Fallback: use weekly curve to estimate daily
          const curveStartDate = curve.startDate || `${curve.year}-01-01`
          const weekly = curve.curve || []
          weekly.forEach((pct, i) => {
            const weekStart = new Date(curveStartDate)
            weekStart.setDate(weekStart.getDate() + i * 7)
            for (let d = 0; d < 7; d++) {
              const day = new Date(weekStart)
              day.setDate(day.getDate() + d)
              const ds = day.toISOString().split('T')[0]
              allDailyMap[ds] = (allDailyMap[ds] || 0) + ((pct as number) / 100 * curve.totalKg / 7)
            }
          })
        }
      }
      const sortedDates = Object.keys(allDailyMap).sort()
      mergedDaily = sortedDates.map(d => Math.round(allDailyMap[d] * 10) / 10)
      startDate = sortedDates[0] || null
    }

    const totalKg = mergedDaily.reduce((s, v) => s + v, 0)

    // Build weekly curve (% per week)
    let weeklyCurve: number[] = []
    let startWeek: number | null = null

    if (startDate && mergedDaily.length > 0) {
      const weekMap: Record<number, number> = {}
      for (let i = 0; i < mergedDaily.length; i++) {
        const d = new Date(startDate)
        d.setDate(d.getDate() + i)
        const wk = getWeekNumber(d)
        weekMap[wk] = (weekMap[wk] || 0) + mergedDaily[i]
      }
      const sortedWeeks = Object.entries(weekMap).sort(([a], [b]) => Number(a) - Number(b))
      weeklyCurve = sortedWeeks.map(([, kg]) =>
        totalKg > 0 ? Math.round((kg / totalKg) * 1000) / 10 : 0
      )
      startWeek = sortedWeeks.length > 0 ? Number(sortedWeeks[0][0]) : null
    } else {
      // Fallback: merge weekly curves directly
      const maxWeeklyLen = Math.max(...curves.map(c => (c.curve || []).length))
      const weeklyKg: number[] = new Array(maxWeeklyLen).fill(0)
      for (const c of curves) {
        const weekly = c.curve || []
        weekly.forEach((pct, i) => {
          weeklyKg[i] += ((pct as number) / 100) * c.totalKg
        })
      }
      const totalWeeklyKg = weeklyKg.reduce((s, v) => s + v, 0)
      weeklyCurve = weeklyKg.map(kg =>
        totalWeeklyKg > 0 ? Math.round((kg / totalWeeklyKg) * 1000) / 10 : 0
      )
      startWeek = Math.min(...curves.map(c => c.startWeek))
    }

    // Compute endDate
    let endDate: string | null = null
    if (startDate && mergedDaily.length > 0) {
      const end = new Date(startDate)
      end.setDate(end.getDate() + mergedDaily.length - 1)
      endDate = end.toISOString().split('T')[0]
    }

    const earliestCurve = curves.reduce((a, b) => a.startWeek < b.startWeek ? a : b)
    const resolvedSeason = overrideSeason || earliestCurve.season
    const resolvedVarietyId = varietyId || earliestCurve.varietyId
    const resolvedWintered = winteredInTunnel ?? earliestCurve.winteredInTunnel ?? false
    const resolvedPlantSource = plantSource || earliestCurve.plantSource || null
    const resolvedProductionYear = productionYear || earliestCurve.year
    const resolvedProductionCycle = productionCycle || 1

    // Create template and archive source curves in a transaction
    const [template] = await prisma.$transaction([
      prisma.productionCurveTemplate.create({
        data: {
          name: name.trim(),
          tenantId,
          productionYear: resolvedProductionYear,
          productionCycle: resolvedProductionCycle,
          season: resolvedSeason,
          plantingDate: plantingDate || null,
          winteredInTunnel: resolvedWintered,
          plantSource: resolvedPlantSource,
          varietyId: resolvedVarietyId || undefined,
          dailyCurve: mergedDaily,
          weeklyCurve,
          startDate,
          endDate,
          startWeek,
          totalKg,
          tempSources: [],
          sourceFile: `Utworzono z ${curves.length} krzyw${curves.length === 1 ? 'ej' : 'ych'}: ${curves.map(c => c.section?.name || c.name || c.id).join(', ')}`,
          sourceHarvestCurveIds: curveIds,
        },
        include: {
          variety: { select: { id: true, name: true } },
          sourceSection: { select: { id: true, name: true } },
        },
      }),
      prisma.harvestCurve.updateMany({
        where: { id: { in: curveIds } },
        data: { isArchived: true },
      }),
    ])

    return NextResponse.json({ template })
  } catch (error) {
    console.error('Error creating template from curves:', error)
    const message = error instanceof Error ? error.message : 'Failed to create template'
    if (message.includes('Unauthorized')) {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
