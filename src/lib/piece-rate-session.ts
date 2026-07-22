import { z } from 'zod'
import { computePieceRate } from '@/lib/piece-rate'

/**
 * Schemat i przeliczenie sesji akordowej.
 *
 * Celowo NIE w pliku route.ts — Next.js App Router traktuje pliki tras
 * specjalnie i eksportowanie z nich dowolnych wartości nie jest wspierane.
 */
const rowSchema = z.object({
  workerName: z.string().min(1),
  externalId: z.string().nullable().optional(),
  kg: z.number().finite().nonnegative(),
  industrialKg: z.number().finite().nonnegative().optional(),
  hours: z.number().finite().nonnegative(),
  isReference: z.boolean().optional(),
  isHarvestWorker: z.boolean().optional(),
  currentAmount: z.number().finite().nullable().optional(),
})

export const blockSchema = z.object({
  areaName: z.string(),
  blockName: z.string().nullable(),
  dessertKg: z.number().finite(),
  industrialKg: z.number().finite(),
  totalKg: z.number().finite(),
  currentAmount: z.number().finite(),
})

export const sessionSchema = z.object({
  harvestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data w formacie YYYY-MM-DD'),
  fileName: z.string().min(1),
  mode: z.enum(['MANUAL', 'AUTO_MEDIAN']),
  targetHourly: z.number().finite().positive(),
  medianCount: z.number().int().positive(),
  breakMinutes: z.number().finite().nonnegative(),
  roundingStep: z.number().finite().positive(),
  /** Ręcznie narzucona stawka zł/kg — zapisujemy ją zamiast wyliczonej */
  rateOverride: z.number().finite().positive().nullable().optional(),
  /** Stała stawka zł/kg za przemysł */
  industrialRate: z.number().finite().positive().nullable().optional(),
  /** Odcięcie najsłabszych poniżej tej wydajności kg/h */
  cutoffKgPerHour: z.number().finite().nonnegative().nullable().optional(),
  note: z.string().nullable().optional(),
  blocks: z.array(blockSchema).optional(),
  rows: z.array(rowSchema).min(1, 'Brak wierszy do zapisania'),
})

export type SessionInput = z.infer<typeof sessionSchema>

/**
 * Przelicza stawkę na serwerze i buduje dane do zapisu.
 * Wspólne dla POST (nowa sesja) i PATCH (edycja) — jedno miejsce prawdy.
 */
export function buildSessionData(body: SessionInput) {
  const result = computePieceRate(body.rows, {
    mode: body.mode,
    targetHourly: body.targetHourly,
    medianCount: body.medianCount,
    roundingStep: body.roundingStep,
    breakHours: body.breakMinutes / 60,
    rateOverride: body.rateOverride === undefined ? null : body.rateOverride,
    industrialRate: body.industrialRate === undefined ? null : body.industrialRate,
  })

  if (result.rate === null) return null

  return {
    result,
    scalars: {
      harvestDate: new Date(body.harvestDate),
      fileName: body.fileName,
      mode: body.mode,
      targetHourly: body.targetHourly,
      medianCount: body.medianCount,
      breakMinutes: Math.round(body.breakMinutes),
      roundingStep: body.roundingStep,
      industrialRate: body.industrialRate === undefined ? null : body.industrialRate,
      cutoffKgPerHour: body.cutoffKgPerHour === undefined ? null : body.cutoffKgPerHour,
      blocks: body.blocks === undefined ? undefined : body.blocks,
      computedRate: result.rate,
      note: body.note || null,
    },
    rowData: result.rows.map((row) => ({
      workerName: row.workerName,
      externalId: row.externalId || null,
      kg: row.kg,
      industrialKg: row.industrialKg,
      dessertKg: row.dessertKg,
      hours: row.hours,
      effectiveHours: row.effectiveHours,
      kgPerHour: row.kgPerHour === null ? 0 : row.kgPerHour,
      isReference: row.isReference,
      isHarvestWorker: row.isHarvestWorker !== false,
      earnings: row.earnings,
      effectiveHourly: row.effectiveHourly,
      currentAmount: row.currentAmount === undefined ? null : row.currentAmount,
    })),
  }
}
