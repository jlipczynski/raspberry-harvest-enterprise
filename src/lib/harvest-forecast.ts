// Harvest Forecast Calculator
// Oblicza 3 warstwy krzywej zbiorów:
// 1. Oryginalna prognoza (GDH + krzywa z odmiany)
// 2. Auto-skalowana prognoza (dopasowana do realnych danych)
// 3. Realne dane (z importu MaxCrop)

export interface HarvestDay {
  date: string
  kg: number
  isPreHarvest: boolean
}

export interface WeeklyForecast {
  week: number
  weekDates: string  // "DD.MM-DD.MM"
  kg: number
  pct: number        // % z krzywej
}

export interface HarvestForecastResult {
  originalForecast: WeeklyForecast[]    // prognoza GDH + krzywa odmiany
  scaledForecast: WeeklyForecast[]      // auto-skalowana po realnych danych
  actual: WeeklyForecast[]              // realne dane z MaxCrop
  preHarvest: WeeklyForecast[]          // dane "pośpiechowe" (przed startem komercyjnym)
  commercialStartDate: string | null    // data zakotwiczenia
  gdhPredictedStartDate: string | null  // prognoza z GDH
  estimatedTotalKg: number              // oryginalny szacunek
  scaledTotalKg: number | null          // przeskalowany szacunek
}

// Numer tygodnia ISO z daty
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

// Daty tygodnia (pon-ndz) z numeru tygodnia
function getWeekDates(weekNum: number, year: number): string {
  const jan1 = new Date(year, 0, 1)
  const daysToMonday = (jan1.getDay() + 6) % 7
  const monday = new Date(year, 0, 1 - daysToMonday + (weekNum - 1) * 7)
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)
  const fmt = (d: Date) => `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}`
  return `${fmt(monday)}-${fmt(sunday)}`
}

// Agreguj dzienne dane do tygodniowych
function aggregateToWeekly(days: HarvestDay[], year: number): WeeklyForecast[] {
  const weekMap: Record<number, number> = {}
  for (const day of days) {
    const wk = getWeekNumber(new Date(day.date))
    weekMap[wk] = (weekMap[wk] || 0) + day.kg
  }
  const totalKg = Object.values(weekMap).reduce((s, v) => s + v, 0)
  return Object.entries(weekMap)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([wk, kg]) => ({
      week: Number(wk),
      weekDates: getWeekDates(Number(wk), year),
      kg: Math.round(kg * 10) / 10,
      pct: totalKg > 0 ? Math.round((kg / totalKg) * 1000) / 10 : 0,
    }))
}

/**
 * Główna funkcja — oblicza 3 warstwy krzywej zbiorów dla sekcji
 */
export function calculateHarvestForecast(params: {
  // Krzywa z odmiany (% na tydzień, np. [2, 6, 12, 16, 15, 13, 11, 9, 7, 5, 3, 1])
  varietyCurve: number[]
  // Szacowany plon całkowity (shoots * yieldPerShoot)
  estimatedTotalKg: number
  // Prognozowany start z GDH (numer tygodnia)
  gdhPredictedStartWeek: number | null
  // Data startu prognozowanego z GDH (yyyy-mm-dd)
  gdhPredictedStartDate: string | null
  // Potwierdzona data startu zbiorów komercyjnych
  commercialStartDate: string | null
  // Realne dane dzienne (z importu MaxCrop / Harvest records)
  actualHarvests: HarvestDay[]
  // Rok
  year: number
}): HarvestForecastResult {
  const {
    varietyCurve,
    estimatedTotalKg,
    gdhPredictedStartWeek,
    gdhPredictedStartDate,
    commercialStartDate,
    actualHarvests,
    year,
  } = params

  // === 1. Oryginalna prognoza (GDH + krzywa odmiany) ===
  const startWeek = gdhPredictedStartWeek || 22 // domyślnie tydzień 22 dla lata
  const originalForecast: WeeklyForecast[] = varietyCurve.map((pct, i) => ({
    week: startWeek + i,
    weekDates: getWeekDates(startWeek + i, year),
    kg: Math.round((pct / 100) * estimatedTotalKg),
    pct,
  }))

  // === Rozdziel dane na pośpiech i komercyjne ===
  const preHarvestDays = actualHarvests.filter(h => h.isPreHarvest)
  const commercialDays = actualHarvests.filter(h => !h.isPreHarvest)

  const preHarvest = aggregateToWeekly(preHarvestDays, year)
  const actual = aggregateToWeekly(commercialDays, year)

  // === 2. Auto-skalowana prognoza ===
  let scaledForecast: WeeklyForecast[] = []
  let scaledTotalKg: number | null = null

  if (commercialStartDate && commercialDays.length > 0) {
    const anchorWeek = getWeekNumber(new Date(commercialStartDate))

    // Ile tygodni komercyjnych mamy w danych realnych?
    const actualCommercialWeeks = actual.length
    // Ile kg zebrano komercyjnie do tej pory?
    const actualCommercialKg = actual.reduce((s, w) => s + w.kg, 0)

    // Jakie % krzywej te tygodnie powinny reprezentować?
    const coveredCurvePct = varietyCurve
      .slice(0, actualCommercialWeeks)
      .reduce((s, p) => s + p, 0)

    if (coveredCurvePct > 0) {
      // Przelicz szacowany total na podstawie realnych danych
      // Jeśli pierwszy tydzień krzywej = 3% i zebraliśmy 200 kg, to total ~ 200 / 0.03 = 6667
      scaledTotalKg = Math.round((actualCommercialKg / coveredCurvePct) * 100)

      // Buduj skalowaną prognozę — od anchor week
      scaledForecast = varietyCurve.map((pct, i) => {
        const week = anchorWeek + i
        // Dla tygodni z danymi realnymi — użyj realnych danych
        const actualWeek = actual.find(a => a.week === week)
        const kg = actualWeek
          ? actualWeek.kg  // mamy realne dane
          : Math.round((pct / 100) * scaledTotalKg!) // prognoza skalowana

        return {
          week,
          weekDates: getWeekDates(week, year),
          kg,
          pct,
        }
      })
    }
  }

  return {
    originalForecast,
    scaledForecast,
    actual,
    preHarvest,
    commercialStartDate,
    gdhPredictedStartDate,
    estimatedTotalKg,
    scaledTotalKg,
  }
}
