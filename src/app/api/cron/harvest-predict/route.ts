import { NextRequest, NextResponse } from 'next/server'
import { runHarvestPrediction } from '@/lib/harvest-predict-runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min — wiele sekcji × zapytania GDH

const CRON_SECRET = process.env.CRON_SECRET

/**
 * Vercel Cron Job — codziennie, po imporcie MaxCrop
 * 1. Uzupełnia wczorajsze (i starsze) predykcje danymi actual (tracking dokładności)
 * 2. Generuje predykcje na najbliższe 7 dni (czyste GDH × krzywa, bez korekty)
 */
export async function GET(request: NextRequest) {
  // Weryfikacja tokenu — Vercel wysyła go automatycznie
  if (CRON_SECRET) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const result = await runHarvestPrediction()
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('Cron harvest-predict error:', error)
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 })
  }
}
