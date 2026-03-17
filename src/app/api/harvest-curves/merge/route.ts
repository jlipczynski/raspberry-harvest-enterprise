import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { curveIds, name } = body as { curveIds: string[]; name: string }

    if (!curveIds || curveIds.length < 2) {
      return NextResponse.json({ error: 'Minimum 2 krzywe do połączenia' }, { status: 400 })
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

    if (curves.length < 2) {
      return NextResponse.json({ error: 'Nie znaleziono wystarczającej liczby krzywych' }, { status: 404 })
    }

    // Validate same season
    const seasons = new Set(curves.map(c => c.season))
    if (seasons.size > 1) {
      return NextResponse.json({ error: 'Wszystkie krzywe muszą mieć ten sam sezon' }, { status: 400 })
    }

    // Merge dailyCurve arrays (pad with zeros to max length)
    const maxDailyLen = Math.max(...curves.map(c => (c.dailyCurve || []).length))
    const mergedDaily: number[] = new Array(maxDailyLen).fill(0)
    for (const c of curves) {
      const daily = c.dailyCurve || []
      for (let i = 0; i < daily.length; i++) {
        mergedDaily[i] += daily[i]
      }
    }

    const mergedTotalKg = mergedDaily.reduce((s, v) => s + v, 0)
    const mergedStartWeek = Math.min(...curves.map(c => c.startWeek))

    // Build weekly curve from merged daily data
    // Use startDate from the curve with earliest startWeek to calculate week numbers
    const earliestCurve = curves.reduce((a, b) => a.startWeek < b.startWeek ? a : b)
    const startDate = earliestCurve.startDate

    let mergedWeeklyCurve: number[] = []
    if (startDate && mergedDaily.length > 0) {
      const weekMap: Record<number, number> = {}
      for (let i = 0; i < mergedDaily.length; i++) {
        const d = new Date(startDate)
        d.setDate(d.getDate() + i)
        const dayNum = d.getUTCDay() || 7
        const thu = new Date(d)
        thu.setDate(thu.getDate() + 4 - dayNum)
        const yearStart = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1))
        const wk = Math.ceil((((thu.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
        weekMap[wk] = (weekMap[wk] || 0) + mergedDaily[i]
      }
      const sortedWeeks = Object.entries(weekMap).sort(([a], [b]) => Number(a) - Number(b))
      mergedWeeklyCurve = sortedWeeks.map(([, kg]) =>
        mergedTotalKg > 0 ? Math.round((kg / mergedTotalKg) * 1000) / 10 : 0
      )
    } else {
      // Fallback: merge weekly curve arrays directly
      const maxWeeklyLen = Math.max(...curves.map(c => (c.curve || []).length))
      const weeklyKg: number[] = new Array(maxWeeklyLen).fill(0)
      for (const c of curves) {
        const weekly = c.curve || []
        for (let i = 0; i < weekly.length; i++) {
          weeklyKg[i] += (weekly[i] / 100) * c.totalKg
        }
      }
      const totalWeeklyKg = weeklyKg.reduce((s, v) => s + v, 0)
      mergedWeeklyCurve = weeklyKg.map(kg =>
        totalWeeklyKg > 0 ? Math.round((kg / totalWeeklyKg) * 1000) / 10 : 0
      )
    }

    // Create merged curve and archive sources in a transaction
    const [mergedCurve] = await prisma.$transaction([
      prisma.harvestCurve.create({
        data: {
          year: earliestCurve.year,
          season: earliestCurve.season,
          curve: mergedWeeklyCurve,
          dailyCurve: mergedDaily,
          startDate: startDate || null,
          totalKg: mergedTotalKg,
          startWeek: mergedStartWeek,
          name: name.trim(),
          isArchived: false,
          mergedFromIds: curveIds,
          sourceFile: `Merged z ${curves.length} krzywych`,
          varietyId: earliestCurve.varietyId,
          winteredInTunnel: earliestCurve.winteredInTunnel,
          plantSource: earliestCurve.plantSource,
          plantingYear: earliestCurve.plantingYear,
          plantingDate: earliestCurve.plantingDate,
          autumnShootDate: earliestCurve.autumnShootDate,
        },
        include: {
          section: { select: { id: true, name: true } },
          variety: { select: { id: true, name: true } },
        },
      }),
      prisma.harvestCurve.updateMany({
        where: { id: { in: curveIds } },
        data: { isArchived: true },
      }),
    ])

    return NextResponse.json({ curve: mergedCurve })
  } catch (error) {
    console.error('Error merging harvest curves:', error)
    return NextResponse.json({ error: 'Failed to merge harvest curves' }, { status: 500 })
  }
}
