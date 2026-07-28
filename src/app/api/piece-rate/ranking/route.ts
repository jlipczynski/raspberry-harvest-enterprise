import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePieceRateContext, PieceRateAccessError } from '@/lib/piece-rate-access'
import { aggregateWorkerRanking } from '@/lib/piece-rate-ranking'

export const dynamic = 'force-dynamic'

/**
 * Ranking pracowników z zapisanych sesji tenanta, opcjonalnie w zakresie dat
 * (po dacie zbioru sesji). Agregacja w JS — wolumen (kilkaset wierszy na dzień)
 * jest mały, a scalanie po kodzie kreskowym siedzi w jednej, testowalnej funkcji.
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await requirePieceRateContext()
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    // Zakres dat filtruje po dacie zbioru sesji, do której należą wiersze.
    const harvestDate: { gte?: Date; lte?: Date } = {}
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) harvestDate.gte = new Date(from)
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) harvestDate.lte = new Date(to)
    const sessionWhere =
      harvestDate.gte || harvestDate.lte ? { tenantId, harvestDate } : { tenantId }

    const rows = await prisma.pieceRateRow.findMany({
      where: { session: sessionWhere },
      select: {
        externalId: true,
        workerName: true,
        kg: true,
        effectiveHours: true,
        isHarvestWorker: true,
        sessionId: true,
      },
    })

    const ranking = aggregateWorkerRanking(rows)

    const sessionCount = await prisma.pieceRateSession.count({ where: sessionWhere })

    return NextResponse.json({ ranking, sessionCount })
  } catch (error) {
    if (error instanceof PieceRateAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[piece-rate/ranking GET] Error:', error)
    return NextResponse.json({ error: 'Nie udało się policzyć rankingu' }, { status: 500 })
  }
}
