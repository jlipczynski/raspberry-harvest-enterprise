import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePieceRateContext, PieceRateAccessError } from '@/lib/piece-rate-access'
import { aggregateWorkerRanking } from '@/lib/piece-rate-ranking'

export const dynamic = 'force-dynamic'

/**
 * Ranking pracowników ze wszystkich zapisanych sesji tenanta.
 * Agregacja w JS — wolumen (kilkaset wierszy na dzień) jest mały, a logika
 * scalania po kodzie kreskowym siedzi w jednej, testowalnej funkcji.
 */
export async function GET() {
  try {
    const { tenantId } = await requirePieceRateContext()

    const rows = await prisma.pieceRateRow.findMany({
      where: { session: { tenantId } },
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

    const sessionCount = await prisma.pieceRateSession.count({ where: { tenantId } })

    return NextResponse.json({ ranking, sessionCount })
  } catch (error) {
    if (error instanceof PieceRateAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[piece-rate/ranking GET] Error:', error)
    return NextResponse.json({ error: 'Nie udało się policzyć rankingu' }, { status: 500 })
  }
}
