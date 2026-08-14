'use client'

import { useState, useEffect, useMemo, useCallback, Fragment } from 'react'
import { Loader2, Plus, Save, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { COST_KEYS, costPln, type CostBook } from '@/lib/strategy'

// ==================== TYPY ====================
export interface CostItemRow {
  key: string
  year: number
  varietyId: string
  label: string
  category: string
  unit: string
  valuePln: number | null
  valueEur: number | null
  sortOrder: number
  note: string | null
}

interface FormRow {
  key: string
  varietyId: string
  valueEur: string
  valuePln: string
}

interface VarietyOption {
  id: string
  name: string
}

/**
 * Katalog rodzajów pozycji. To stałe UI — decydują, do czego cena jest używana
 * w wyliczeniach, więc użytkownik wybiera rodzaj z listy zamiast wpisywać dowolny tekst.
 */
interface CostRole {
  key: string
  label: string
  category: string
  unit: string
  /** czy cena może dotyczyć konkretnej odmiany */
  perVariety: boolean
  /** pozycja występuje tylko raz i bez odmiany (kurs, udziały płatności) */
  single?: boolean
  note?: string
}

const COST_ROLES: CostRole[] = [
  { key: COST_KEYS.eurPln, label: 'Kurs EUR/PLN', category: 'general', unit: 'PLN za 1 EUR', perVariety: false, single: true },

  { key: COST_KEYS.lcPrice, label: 'Zakup long cane', category: 'seedlings', unit: 'PLN / szt.', perVariety: true },
  { key: COST_KEYS.plugPrice, label: 'Zakup plagi', category: 'seedlings', unit: 'PLN / szt.', perVariety: true },
  { key: COST_KEYS.tipsPrice, label: 'Zakup tipsa', category: 'seedlings', unit: 'PLN / szt.', perVariety: true },

  { key: COST_KEYS.cocoPerPot, label: 'Kokos', category: 'materials', unit: 'PLN / doniczkę', perVariety: false },
  { key: COST_KEYS.targetPot, label: 'Doniczka docelowa', category: 'materials', unit: 'PLN / doniczkę', perVariety: false },
  { key: COST_KEYS.nurseryPot, label: 'Doniczka szkółkowa', category: 'materials', unit: 'PLN / szt.', perVariety: false },

  { key: COST_KEYS.lcTransport, label: 'Transport sadzonki', category: 'services', unit: 'PLN / long cane', perVariety: true },
  { key: COST_KEYS.tipsTransport, label: 'Transport plag', category: 'services', unit: 'PLN / szt.', perVariety: true },
  { key: COST_KEYS.plantingLabourPerPot, label: 'Sadzenie', category: 'services', unit: 'PLN / doniczkę', perVariety: false },
  { key: COST_KEYS.lcGrowFromPlug, label: 'Wyhodowanie z plagi do long cane', category: 'services', unit: 'PLN / long cane', perVariety: true },
  { key: COST_KEYS.autumnShoot, label: 'Wyprodukowanie pędu jesiennego', category: 'services', unit: 'PLN / pęd', perVariety: true },

  { key: COST_KEYS.payOrderPct, label: 'Przy zamówieniu', category: 'payment', unit: '%', perVariety: false, single: true },
  { key: COST_KEYS.payOrderYearOffset, label: '↳ rok wydatku', category: 'payment', unit: 'rok (−1 = wcześniej)', perVariety: false, single: true },
  { key: COST_KEYS.payDeliveryPct, label: 'Przy dostawie', category: 'payment', unit: '%', perVariety: false, single: true },
  { key: COST_KEYS.payDeliveryYearOffset, label: '↳ rok wydatku', category: 'payment', unit: 'rok (0 = rok kosztu)', perVariety: false, single: true },
  { key: COST_KEYS.payRestPct, label: 'Reszta', category: 'payment', unit: '%', perVariety: false, single: true },
  { key: COST_KEYS.payRestYearOffset, label: '↳ rok wydatku', category: 'payment', unit: 'rok (+1 = później)', perVariety: false, single: true },
]

const GROUPS: { id: string; label: string; hint?: string }[] = [
  { id: 'general', label: 'Parametry ogólne' },
  { id: 'seedlings', label: 'Sadzonki', hint: 'cena materiału roślinnego — osobno dla każdej odmiany' },
  { id: 'materials', label: 'Materiały pomocnicze' },
  { id: 'services', label: 'Usługi pomocnicze' },
  { id: 'payment', label: 'Warunki płatności za rośliny' },
]

/** Propozycje wartości z arkusza użytkownika — trafiają do bazy dopiero po zapisie. */
const SUGGESTIONS: { key: string; perVariety?: boolean; pln?: number; eur?: number }[] = [
  { key: COST_KEYS.eurPln, pln: 4.31 },
  { key: COST_KEYS.lcPrice, perVariety: true },
  { key: COST_KEYS.tipsPrice, eur: 0.65 },
  { key: COST_KEYS.cocoPerPot, pln: 3.616667 },
  { key: COST_KEYS.targetPot, pln: 0 },
  { key: COST_KEYS.nurseryPot, pln: 0.5 },
  { key: COST_KEYS.lcTransport, pln: 0.374783 },
  { key: COST_KEYS.tipsTransport, pln: 0.057143 },
  { key: COST_KEYS.plantingLabourPerPot, pln: 0 },
  { key: COST_KEYS.lcGrowFromPlug, eur: 0.55 },
  { key: COST_KEYS.autumnShoot, pln: 0 },
  { key: COST_KEYS.payOrderPct, pln: 25 },
  { key: COST_KEYS.payOrderYearOffset, pln: -1 },
  { key: COST_KEYS.payDeliveryPct, pln: 25 },
  { key: COST_KEYS.payDeliveryYearOffset, pln: 0 },
  { key: COST_KEYS.payRestPct, pln: 50 },
  { key: COST_KEYS.payRestYearOffset, pln: 1 },
]

/** Ceny long cane z arkusza, po nazwie odmiany. */
const LC_PRICE_EUR_BY_VARIETY: Record<string, number> = { 'Ruby': 2.2, 'Diamond Jubilee': 2.15 }

// ==================== POMOCNICZE ====================
const parseNum = (v: string): number | null => {
  if (v.trim() === '') return null
  const n = parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const numToText = (n: number | null | undefined): string => (n == null ? '' : String(n).replace('.', ','))
const fmtHint = (n: number) =>
  n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
const roleOf = (key: string) => COST_ROLES.find(r => r.key === key)
const rowId = (r: { key: string; varietyId: string }) => `${r.key}|${r.varietyId}`

// ==================== KOMPONENT ====================
export default function CostBookPanel({
  allItems,
  onSaved,
  varieties,
  years,
  costYear,
  setCostYear,
}: {
  allItems: CostItemRow[]
  onSaved: (items: CostItemRow[]) => void
  varieties: VarietyOption[]
  years: number[]
  costYear: number
  setCostYear: (y: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<FormRow[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // przepisanie danych roku na formularz
  useEffect(() => {
    setRows(
      allItems
        .filter(i => i.year === costYear)
        .map(i => ({
          key: i.key,
          varietyId: i.varietyId ?? '',
          valueEur: numToText(i.valueEur),
          valuePln: numToText(i.valuePln),
        }))
    )
  }, [allItems, costYear])

  /** kurs z formularza — do przeliczeń EUR ↔ PLN na żywo */
  const fxRate = useMemo(() => {
    const own = rows.find(r => r.key === COST_KEYS.eurPln)
    const typed = own ? parseNum(own.valuePln) : null
    if (typed != null) return typed
    const base = allItems.find(i => i.year === 0 && i.key === COST_KEYS.eurPln)
    return base?.valuePln ?? null
  }, [rows, allItems])

  /** wartość z cennika bazowego — podpowiedź, gdy rok nie ma własnej pozycji */
  const inherited = useCallback(
    (r: FormRow): CostBook['items'][number] | null => {
      if (costYear === 0) return null
      const base = allItems.find(i => i.year === 0 && i.key === r.key && (i.varietyId ?? '') === r.varietyId)
      return base ? { key: base.key, varietyId: base.varietyId, valuePln: base.valuePln, valueEur: base.valueEur } : null
    },
    [allItems, costYear]
  )

  const varietyName = useCallback(
    (id: string) => varieties.find(v => v.id === id)?.name ?? null,
    [varieties]
  )

  const update = (id: string, patch: Partial<FormRow>) =>
    setRows(prev => prev.map(r => (rowId(r) === id ? { ...r, ...patch } : r)))

  const addRow = (category: string) => {
    const taken = new Set(rows.map(rowId))
    const candidates = COST_ROLES.filter(r => r.category === category)
    // pierwszy rodzaj, dla którego da się jeszcze dodać wiersz
    for (const role of candidates) {
      if (role.perVariety) {
        const free = ['', ...varieties.map(v => v.id)].find(vid => !taken.has(`${role.key}|${vid}`))
        if (free !== undefined) {
          setRows(prev => [...prev, { key: role.key, varietyId: free, valueEur: '', valuePln: '' }])
          return
        }
      } else if (!taken.has(`${role.key}|`)) {
        setRows(prev => [...prev, { key: role.key, varietyId: '', valueEur: '', valuePln: '' }])
        return
      }
    }
    setError('W tej grupie masz już wszystkie możliwe pozycje')
  }

  const applySuggestions = () => {
    const next: FormRow[] = []
    for (const s of SUGGESTIONS) {
      if (s.perVariety) {
        for (const v of varieties) {
          const eur = LC_PRICE_EUR_BY_VARIETY[v.name]
          next.push({ key: s.key, varietyId: v.id, valueEur: numToText(eur ?? null), valuePln: '' })
        }
        continue
      }
      next.push({ key: s.key, varietyId: '', valueEur: numToText(s.eur ?? null), valuePln: numToText(s.pln ?? null) })
    }
    setRows(next)
  }

  const copyFromBase = () => {
    setRows(
      allItems
        .filter(i => i.year === 0)
        .map(i => ({
          key: i.key,
          varietyId: i.varietyId ?? '',
          valueEur: numToText(i.valueEur),
          valuePln: numToText(i.valuePln),
        }))
    )
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const payload = rows.map((r, i) => {
        const role = roleOf(r.key)
        return {
          key: r.key,
          varietyId: r.varietyId,
          label: role?.label ?? r.key,
          category: role?.category ?? 'general',
          unit: role?.unit ?? '',
          valueEur: parseNum(r.valueEur),
          valuePln: parseNum(r.valuePln),
          sortOrder: i * 10,
        }
      })
      const res = await fetch('/api/strategy/cost-book', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: costYear, items: payload }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      onSaved(data.items || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zapisać cennika')
    } finally {
      setSaving(false)
    }
  }

  const paymentTotal = useMemo(
    () =>
      [COST_KEYS.payOrderPct, COST_KEYS.payDeliveryPct, COST_KEYS.payRestPct].reduce((s, key) => {
        const r = rows.find(x => x.key === key)
        return s + (r ? parseNum(r.valuePln) ?? 0 : 0) // dozwolone: puste pole nie dokłada się do sumy
      }, 0),
    [rows]
  )

  return (
    <div className="bg-white border border-gray-200 rounded-xl">
      <div className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap">
        <button onClick={() => setOpen(v => !v)} className="flex items-center gap-2 text-left">
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          <span className="font-medium text-gray-900">Cennik</span>
          <span className="text-xs text-gray-500">
            {costYear === 0 ? 'bazowy — obowiązuje w każdym roku' : `na rok ${costYear}`}
            {' · '}
            {rows.length} poz.
          </span>
        </button>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Rok:</label>
          <select
            value={costYear}
            onChange={e => { setCostYear(parseInt(e.target.value)); setOpen(true) }}
            className="h-8 border border-gray-200 rounded-lg px-2 text-sm bg-white"
          >
            <option value={0}>Bazowy (wszystkie lata)</option>
            {years.map(y => (
              <option key={y} value={y}>
                {y}{allItems.some(i => i.year === y) ? '' : ' — pusty'}
              </option>
            ))}
          </select>
        </div>
      </div>

      {open && (
        <div className="border-t border-gray-100">
          <div className="flex items-center gap-2 flex-wrap px-4 py-2 bg-gray-50/70 border-b border-gray-100">
            <button onClick={applySuggestions}
              className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded hover:bg-gray-100">
              Wstaw wartości z arkusza
            </button>
            {costYear !== 0 && (
              <button onClick={copyFromBase}
                className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded hover:bg-gray-100">
                Skopiuj z bazowego
              </button>
            )}
            <span className="text-xs text-gray-400">
              {costYear === 0
                ? 'obowiązuje wszędzie, gdzie rok nie ma własnej ceny'
                : 'puste pole = cena z cennika bazowego'}
            </span>
            <button onClick={save} disabled={saving}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Zapisz {costYear === 0 ? 'bazowy' : costYear}
            </button>
          </div>

          {error && <div className="px-4 py-2 text-xs text-red-700 bg-red-50 border-b border-red-100">{error}</div>}

          <div className="overflow-x-auto">
            <table className="w-full table-fixed border-collapse text-[13px]">
              <colgroup>
                <col />
                <col className="w-44" />
                <col className="w-24" />
                <col className="w-24" />
                <col className="w-36" />
                <col className="w-8" />
              </colgroup>
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-gray-500 bg-gray-100">
                  <th className="text-left font-medium px-2 py-1 border border-gray-300">Pozycja</th>
                  <th className="text-left font-medium px-2 py-1 border border-gray-300">Odmiana</th>
                  <th className="text-right font-medium px-2 py-1 border border-gray-300">EUR</th>
                  <th className="text-right font-medium px-2 py-1 border border-gray-300">PLN</th>
                  <th className="text-left font-medium px-2 py-1 border border-gray-300">Jednostka</th>
                  <th className="border border-gray-300" />
                </tr>
              </thead>
              <tbody>
                {GROUPS.map(group => {
                  const groupRows = rows.filter(r => roleOf(r.key)?.category === group.id)
                  return (
                    <Fragment key={group.id}>
                      <tr>
                        <td colSpan={6} className="px-2 py-0.5 bg-gray-200/70 border border-gray-300">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-700">{group.label}</span>
                            {group.hint && <span className="text-[11px] text-gray-500">{group.hint}</span>}
                            <button
                              onClick={() => { setError(null); addRow(group.id) }}
                              className="ml-auto inline-flex items-center gap-1 text-[11px] text-indigo-700 hover:text-indigo-900"
                            >
                              <Plus className="w-3 h-3" /> dodaj
                            </button>
                          </div>
                        </td>
                      </tr>

                      {groupRows.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-2 py-1 border border-gray-200 text-[11px] text-gray-400">
                            brak pozycji — kliknij „dodaj”
                          </td>
                        </tr>
                      )}

                      {groupRows.map(r => {
                        const role = roleOf(r.key)!
                        const id = rowId(r)
                        const eurNum = parseNum(r.valueEur)
                        const plnNum = parseNum(r.valuePln)
                        const base = inherited(r)
                        const hintPln = eurNum != null && fxRate != null ? eurNum * fxRate : base?.valuePln ?? null
                        const hintEur = plnNum != null && fxRate ? plnNum / fxRate : base?.valueEur ?? null
                        const usedKeys = new Set(rows.map(rowId))
                        return (
                          <tr key={id} className="hover:bg-indigo-50/40">
                            <td className="border border-gray-200 p-0">
                              <select
                                value={r.key}
                                onChange={e => update(id, { key: e.target.value })}
                                className="h-6 w-full bg-transparent px-1.5 outline-none focus:bg-indigo-50"
                              >
                                {COST_ROLES.filter(x => x.category === group.id).map(x => (
                                  <option
                                    key={x.key}
                                    value={x.key}
                                    disabled={x.key !== r.key && usedKeys.has(`${x.key}|${r.varietyId}`)}
                                  >
                                    {x.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="border border-gray-200 p-0">
                              {role.perVariety ? (
                                <select
                                  value={r.varietyId}
                                  onChange={e => update(id, { varietyId: e.target.value })}
                                  className="h-6 w-full bg-transparent px-1.5 outline-none focus:bg-indigo-50"
                                >
                                  <option value="">wszystkie odmiany</option>
                                  {varieties.map(v => (
                                    <option key={v.id} value={v.id} disabled={usedKeys.has(`${r.key}|${v.id}`) && v.id !== r.varietyId}>
                                      {v.name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <div className="h-6 flex items-center px-1.5 text-[11px] text-gray-400">—</div>
                              )}
                            </td>
                            <td className="border border-gray-200 p-0">
                              {role.single ? (
                                <div className="h-6 flex items-center justify-end px-2 text-[11px] text-gray-400">
                                  {role.key === COST_KEYS.eurPln ? '1 EUR =' : ''}
                                </div>
                              ) : (
                                <input
                                  inputMode="decimal"
                                  value={r.valueEur}
                                  onChange={e => update(id, { valueEur: e.target.value })}
                                  placeholder={hintEur != null ? fmtHint(hintEur) : ''}
                                  className="h-6 w-full bg-transparent px-2 text-right tabular-nums outline-none focus:bg-indigo-50 placeholder:text-gray-300"
                                />
                              )}
                            </td>
                            <td className="border border-gray-200 p-0">
                              <input
                                inputMode="decimal"
                                value={r.valuePln}
                                onChange={e => update(id, { valuePln: e.target.value })}
                                placeholder={hintPln != null ? fmtHint(hintPln) : ''}
                                className="h-6 w-full bg-transparent px-2 text-right tabular-nums outline-none focus:bg-indigo-50 placeholder:text-gray-300"
                              />
                            </td>
                            <td className="px-2 py-0.5 border border-gray-200 text-[11px] text-gray-500 truncate" title={role.unit}>
                              {role.unit}
                            </td>
                            <td className="border border-gray-200 text-center">
                              <button
                                onClick={() => setRows(prev => prev.filter(x => rowId(x) !== id))}
                                className="text-gray-300 hover:text-red-600"
                                title="usuń pozycję"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}

                      {group.id === 'payment' && groupRows.length > 0 && (
                        <tr className={`font-semibold ${Math.abs(paymentTotal - 100) < 0.001 ? 'bg-gray-50' : 'bg-amber-50 text-amber-800'}`}>
                          <td className="px-2 py-0.5 border border-gray-200" colSpan={3}>Razem udziały</td>
                          <td className="px-2 py-0.5 border border-gray-200 text-right tabular-nums">{paymentTotal}</td>
                          <td className="px-2 py-0.5 border border-gray-200 text-[11px]" colSpan={2}>
                            {Math.abs(paymentTotal - 100) < 0.001 ? '% — komplet' : '% — powinno być 100'}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-100">
            Szara liczba w polu to przeliczenie po kursie{' '}
            {fxRate != null ? `${numToText(fxRate)} zł/EUR` : '— brak kursu'} albo wartość z cennika bazowego.
            Cena przypisana do odmiany ma pierwszeństwo przed pozycją „wszystkie odmiany”.
          </div>
        </div>
      )}
    </div>
  )
}

/** Cennik obowiązujący w danym roku: pozycja roku, a gdy jej brak — pozycja bazowa. */
export function buildBookForYear(allItems: CostItemRow[], year: number): CostBook {
  const ids = [...new Set(allItems.map(i => `${i.key}|${i.varietyId ?? ''}`))]
  return {
    items: ids.map(id => {
      const [key, varietyId] = id.split('|')
      const match = (i: CostItemRow) => i.key === key && (i.varietyId ?? '') === varietyId
      const row = allItems.find(i => i.year === year && match(i)) ?? allItems.find(i => i.year === 0 && match(i))
      return { key, varietyId, valuePln: row?.valuePln ?? null, valueEur: row?.valueEur ?? null }
    }),
  }
}

export { costPln }
