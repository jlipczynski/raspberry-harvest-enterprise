import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

interface DailyAgg {
  date: Date
  cnt: number
  sum_positive: number
}

export async function GET() {
  try {
    const tenantId = await requireTenantId()
    const farm = await prisma.farm.findFirst({
      where: { tenantId },
      include: {
        blocks: {
          include: {
            sections: {
              include: { variety: true }
            }
          },
          orderBy: { name: 'asc' }
        },
        weatherData: {
          orderBy: { date: 'asc' },
          take: 365
        }
      }
    })

    if (!farm) {
      return NextResponse.json({ sections: [], farmWeather: [] })
    }

    const allSections = farm.blocks.flatMap(b =>
      b.sections.map(s => ({ ...s, blockName: b.name }))
    )

    const sectionResults = await Promise.all(
      allSections.map(async (section) => {
        const v = section.variety
        const baseTemp = section.baseTemp ?? v?.baseTemp ?? 6.0

        // Calculate daily GDH from actual temperature readings (CSV data)
        const dailyAgg: DailyAgg[] = await prisma.$queryRaw`
          SELECT
            DATE("timestamp") as date,
            COUNT(*)::int as cnt,
            COALESCE(SUM(GREATEST(0, "temperature" - ${baseTemp})), 0)::float as sum_positive
          FROM temperature_readings
          WHERE "sectionId" = ${section.id}
          GROUP BY DATE("timestamp")
          ORDER BY date
        `

        let cumulative = 0
        const dailyGdh = dailyAgg.map(d => {
          // GDH = sum_positive * (24 / readings_count)
          // This accounts for reading interval automatically
          const daily = d.cnt > 0 ? (Number(d.sum_positive) * 24.0) / d.cnt : 0
          cumulative += daily
          return {
            date: d.date,
            dailyGdh: Math.round(daily),
            cumulativeGdh: Math.round(cumulative),
            readingCount: d.cnt
          }
        })

        // Determine thresholds based on section type
        let flowerThreshold: number | null = null
        let fruitThreshold: number | null = null
        let thresholdType = 'autumn'

        if (section.winteredInTunnel) {
          flowerThreshold = section.gdhWinteredFlower ?? v?.gdhWinteredFlower ?? null
          fruitThreshold = section.gdhWinteredFruit ?? v?.gdhWinteredFruit ?? null
          thresholdType = 'wintered'
        } else if (section.plantMaterialType === 'LONGCANE') {
          flowerThreshold = section.gdhLcFlower ?? v?.gdhLcFlower ?? null
          fruitThreshold = section.gdhLcFruit ?? v?.gdhLcFruit ?? null
          thresholdType = 'lc'
        } else {
          flowerThreshold = section.gdhAutumnFlower ?? v?.gdhAutumnFlower ?? null
          fruitThreshold = section.gdhAutumnFruit ?? v?.gdhAutumnFruit ?? null
          thresholdType = 'autumn'
        }

        return {
          id: section.id,
          name: section.name || `Sekcja`,
          blockName: section.blockName,
          varietyId: section.varietyId,
          varietyName: v?.name || 'Nieznana',
          baseTemp,
          winteredInTunnel: section.winteredInTunnel,
          plantingDate: section.plantingDate,
          plantMaterialType: section.plantMaterialType,
          flowerThreshold,
          fruitThreshold,
          thresholdType,
          dailyGdh,
          currentGdh: Math.round(cumulative),
          totalReadings: dailyAgg.reduce((s, d) => s + d.cnt, 0),
        }
      })
    )

    return NextResponse.json({
      sections: sectionResults,
      farmWeather: farm.weatherData.map(w => ({
        date: w.date,
        tempMin: w.tempMin,
        tempMax: w.tempMax,
        gdhDaily: w.gdhDaily,
        gdhCumulative: w.gdhCumulative,
      })),
    })
  } catch (error) {
    console.error('Error calculating GDH:', error)
    return NextResponse.json({ error: 'Failed to calculate GDH' }, { status: 500 })
  }
}
