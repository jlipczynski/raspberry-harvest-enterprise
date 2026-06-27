/**
 * Daily Harvest Prediction Script — manual run
 *
 * Logika żyje w src/lib/harvest-predict-runner.ts (współdzielona z Vercel cronem
 * /api/cron/harvest-predict — jedno źródło prawdy, bez duplikacji).
 *
 * 1. Uzupełnia wczorajsze (i starsze) predykcje danymi actual (tracking dokładności)
 * 2. Generuje predykcje na najbliższe 7 dni (czyste GDH × krzywa, bez korekty)
 *
 * Usage: npx tsx scripts/harvest-predict.ts
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { prisma } from '@/lib/prisma'
import { runHarvestPrediction } from '@/lib/harvest-predict-runner'

runHarvestPrediction()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('[Predict] Błąd:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
