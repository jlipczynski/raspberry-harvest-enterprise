'use client'

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import {
  Printer, ArrowLeft,
  Warehouse, Leaf, CalendarDays, Snowflake, Sprout, Ruler, Package, GitBranch, ShoppingBag,
} from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { pl, enUS } from 'date-fns/locale'
import type { Locale } from 'date-fns'

interface Variety { id: string; name: string }
interface Section {
  id: string
  name: string | null
  metersLength: number
  potsPerMeter: number
  shootsPerPot: number
  potsOverride?: number | null
  productionYear?: number | null
  plantSource?: string | null
  winteredInTunnel?: boolean
  plantingDate?: string | null
  variety?: Variety | null
}
interface Block { id: string; name: string; sections: Section[] }
interface Farm { id: string; name: string }
interface SectionRow { blockName: string; section: Section; pots: number; shoots: number }

// ─── tunnel colour palette ─────────────────────────────────────────────────
const PALETTE = [
  { banner: 'bg-emerald-700',  col: 'bg-emerald-600',  cell: 'bg-emerald-50/60',  divide: 'border-emerald-300' },
  { banner: 'bg-blue-700',     col: 'bg-blue-600',     cell: 'bg-blue-50/60',     divide: 'border-blue-300'    },
  { banner: 'bg-violet-700',   col: 'bg-violet-600',   cell: 'bg-violet-50/60',   divide: 'border-violet-300'  },
  { banner: 'bg-rose-700',     col: 'bg-rose-600',     cell: 'bg-rose-50/60',     divide: 'border-rose-300'    },
  { banner: 'bg-teal-700',     col: 'bg-teal-600',     cell: 'bg-teal-50/60',     divide: 'border-teal-300'    },
  { banner: 'bg-orange-700',   col: 'bg-orange-600',   cell: 'bg-orange-50/60',   divide: 'border-orange-300'  },
]

// ─── row definitions ───────────────────────────────────────────────────────
type RowDef = { key: string; labelPl: string; labelEn: string; numeric: boolean; Icon: React.ElementType }

const ROWS: RowDef[] = [
  { key: 'blockName',      labelPl: 'Tunel',            labelEn: 'Tunnel',          numeric: false, Icon: Warehouse    },
  { key: 'varietyName',    labelPl: 'Odmiana',          labelEn: 'Variety',         numeric: false, Icon: Leaf         },
  { key: 'productionYear', labelPl: 'Rok produkcyjny',  labelEn: 'Production year', numeric: false, Icon: CalendarDays },
  { key: 'wintered',       labelPl: 'Zimowana',         labelEn: 'Wintered',        numeric: false, Icon: Snowflake    },
  { key: 'plantingDate',   labelPl: 'Data wysadzenia',  labelEn: 'Planting date',   numeric: false, Icon: Sprout       },
  { key: 'meters',         labelPl: 'Metrów bieżących', labelEn: 'Running meters',  numeric: true,  Icon: Ruler        },
  { key: 'pots',           labelPl: 'Doniczek',         labelEn: 'Pots',            numeric: true,  Icon: Package      },
  { key: 'shoots',         labelPl: 'Pędów',            labelEn: 'Shoots',          numeric: true,  Icon: GitBranch    },
  { key: 'plantSource',    labelPl: 'Źródło sadzonek',  labelEn: 'Plant source',    numeric: false, Icon: ShoppingBag  },
]

// ─── cell value helpers ────────────────────────────────────────────────────
function getCell(key: string, row: SectionRow, locale: Locale, yes: string, no: string, own: string, nursery: string): string {
  const s = row.section
  switch (key) {
    case 'blockName':      return row.blockName
    case 'varietyName':    return s.variety?.name ?? '—'
    case 'productionYear': return s.productionYear != null ? String(s.productionYear) : '—'
    case 'wintered':       return s.winteredInTunnel ? yes : no
    case 'plantingDate':   return s.plantingDate ? format(new Date(s.plantingDate), 'd MMM yyyy', { locale }) : '—'
    case 'meters':         return s.metersLength.toLocaleString(locale === pl ? 'pl-PL' : 'en-US')
    case 'pots':           return Math.round(row.pots).toLocaleString(locale === pl ? 'pl-PL' : 'en-US')
    case 'shoots':         return Math.round(row.shoots).toLocaleString(locale === pl ? 'pl-PL' : 'en-US')
    case 'plantSource':
      if (s.plantSource === 'OWN') return own
      if (s.plantSource === 'NURSERY') return nursery
      return '—'
    default: return '—'
  }
}

// ─── reusable table ─────────────────────────────────────────────────────────
function SummaryTable({
  rows,
  lang,
  totals,
  colorMap,
}: {
  rows: SectionRow[]
  lang: 'pl' | 'en'
  totals: Record<string, string>
  colorMap: Map<string, number>
}) {
  const isPl = lang === 'pl'
  const locale = isPl ? pl : enUS
  const yes = isPl ? 'Tak' : 'Yes'
  const no  = isPl ? 'Nie' : 'No'
  const own     = isPl ? 'Własne plugi'         : 'Own plugs'
  const nursery = isPl ? 'Zewnętrzna szkółka'   : 'External nursery'
  const propHeader = isPl ? 'Właściwość'  : 'Property'
  const totalLabel = isPl ? 'Suma'        : 'Total'

  // Build tunnel groups for colspan
  type TunnelGroup = { blockName: string; count: number; colorIdx: number }
  const groups: TunnelGroup[] = []
  rows.forEach(row => {
    const last = groups[groups.length - 1]
    if (last?.blockName === row.blockName) { last.count++ }
    else groups.push({ blockName: row.blockName, count: 1, colorIdx: (colorMap.get(row.blockName) ?? 0) % PALETTE.length })
  })

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-lg">
      <table className="w-full text-sm border-collapse">
        <thead>
          {/* Row 1 – tunnel banners */}
          <tr>
            <th
              rowSpan={2}
              className="text-left px-4 py-3 bg-gray-900 text-white font-bold text-[11px] uppercase tracking-widest border-r border-gray-700 sticky left-0 z-20 whitespace-nowrap"
            >
              {propHeader}
            </th>
            {groups.map(g => (
              <th
                key={g.blockName}
                colSpan={g.count}
                className={`text-center px-3 py-2 font-bold text-xs uppercase tracking-wider text-white border-r-2 border-white/40 ${PALETTE[g.colorIdx].banner}`}
              >
                {g.blockName}
              </th>
            ))}
            <th
              rowSpan={2}
              className="text-center px-4 py-3 bg-amber-500 text-white font-bold text-[11px] uppercase tracking-widest whitespace-nowrap"
            >
              {totalLabel}
            </th>
          </tr>
          {/* Row 2 – section names */}
          <tr>
            {rows.map((row, i) => {
              const ci = (colorMap.get(row.blockName) ?? 0) % PALETTE.length
              const isLast = i === rows.length - 1 || rows[i + 1].blockName !== row.blockName
              return (
                <th
                  key={row.section.id}
                  className={`text-center px-2 py-2 text-[11px] font-semibold text-white whitespace-nowrap min-w-[80px] ${isLast ? 'border-r-2 border-white/40' : 'border-r border-white/20'} ${PALETTE[ci].col}`}
                >
                  {row.section.name ?? '—'}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {ROWS.map(({ key, labelPl, labelEn, numeric, Icon }, rowIdx) => {
            const label = isPl ? labelPl : labelEn
            const isEven = rowIdx % 2 === 0
            return (
              <tr key={key}>
                {/* Property label */}
                <td className={`px-3 py-2 border-r border-gray-200 sticky left-0 z-10 whitespace-nowrap ${isEven ? 'bg-gray-50' : 'bg-white'}`}>
                  <div className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="text-xs font-medium text-gray-700">{label}</span>
                  </div>
                </td>
                {/* Data cells */}
                {rows.map((row, colIdx) => {
                  const ci = (colorMap.get(row.blockName) ?? 0) % PALETTE.length
                  const isLastInTunnel = colIdx === rows.length - 1 || rows[colIdx + 1].blockName !== row.blockName
                  const val = getCell(key, row, locale, yes, no, own, nursery)
                  return (
                    <td
                      key={row.section.id}
                      className={`px-2 py-2 text-xs whitespace-nowrap
                        ${isLastInTunnel ? `border-r-2 ${PALETTE[ci].divide}` : 'border-r border-gray-100'}
                        ${numeric ? 'text-center tabular-nums font-medium' : 'text-center'}
                        ${isEven ? 'bg-white' : 'bg-gray-50'}`}
                    >
                      {val}
                    </td>
                  )
                })}
                {/* Total cell */}
                <td className={`px-3 py-2 text-xs font-bold whitespace-nowrap ${numeric ? 'text-center tabular-nums text-amber-700 bg-amber-50' : 'text-center text-gray-300 bg-amber-50/40'}`}>
                  {numeric ? (totals[key] ?? '—') : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
        {/* Footer totals row */}
        <tfoot>
          <tr className="border-t-2 border-amber-300 bg-amber-50">
            <td className="px-3 py-2.5 font-bold text-xs text-amber-800 sticky left-0 bg-amber-50 uppercase tracking-wide">
              {totalLabel}
            </td>
            {rows.map(() => (
              <td key={Math.random()} className="px-2 py-2.5 border-r border-amber-200" />
            ))}
            <td className="px-3 py-2.5 bg-amber-200 text-center">
              <div className="flex flex-col gap-0.5 items-center">
                <span className="text-[10px] text-amber-700 font-medium">{totals.meters} {isPl ? 'mb' : 'm'}</span>
                <span className="text-[10px] text-amber-700 font-medium">{totals.pots} {isPl ? 'don.' : 'pots'}</span>
                <span className="text-[10px] text-amber-700 font-medium">{totals.shoots} {isPl ? 'pędów' : 'shoots'}</span>
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ─── page ───────────────────────────────────────────────────────────────────
export default function PlantationSummaryPage() {
  const [rows, setRows]     = useState<SectionRow[]>([])
  const [farmName, setFarmName] = useState('')
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    fetch('/api/plantation')
      .then(r => r.json())
      .then((data: { blocks: Block[]; farm: Farm | null }) => {
        const sorted = (data.blocks ?? []).slice().sort((a, b) => a.name.localeCompare(b.name, 'pl'))
        const built: SectionRow[] = sorted.flatMap(block =>
          block.sections
            .slice()
            .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'pl'))
            .map(section => {
              const pots = (section.potsOverride != null && section.potsOverride > 0)
                ? section.potsOverride
                : section.metersLength * section.potsPerMeter
              return { blockName: block.name, section, pots, shoots: pots * section.shootsPerPot }
            })
        )
        setRows(built)
        setFarmName(data.farm?.name ?? '')
      })
      .finally(() => setLoading(false))
  }, [])

  // Build stable tunnel→color map (assigned in order of appearance)
  const colorMap = new Map<string, number>()
  rows.forEach(row => {
    if (!colorMap.has(row.blockName)) colorMap.set(row.blockName, colorMap.size)
  })

  const totalMeters = rows.reduce((s, r) => s + r.section.metersLength, 0)
  const totalPots   = rows.reduce((s, r) => s + r.pots, 0)
  const totalShoots = rows.reduce((s, r) => s + r.shoots, 0)
  const totals = {
    meters: totalMeters.toLocaleString('pl-PL'),
    pots:   Math.round(totalPots).toLocaleString('pl-PL'),
    shoots: Math.round(totalShoots).toLocaleString('pl-PL'),
  }
  const totalsEn = {
    meters: totalMeters.toLocaleString('en-US'),
    pots:   Math.round(totalPots).toLocaleString('en-US'),
    shoots: Math.round(totalShoots).toLocaleString('en-US'),
  }

  const today = new Date()

  return (
    <>
      <style>{`
        @media print {
          aside, header, .print-hidden { display: none !important; }
          body { margin: 0; }
          .lg\\:ml-64 { margin-left: 0 !important; }
          main { padding: 8px !important; }
          @page { size: landscape; margin: 10mm; }
          table { font-size: 9px; }
          th, td { padding: 2px 4px !important; }
        }
      `}</style>

      <div className="max-w-full space-y-8">

        {/* ── Page header ─────────────────────────────── */}
        <div className="flex items-center justify-between print-hidden">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/plantation">
              <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Podsumowanie plantacji</h1>
              {farmName && <p className="text-gray-500 text-sm">{farmName}</p>}
            </div>
          </div>
          <Button onClick={() => window.print()} className="bg-green-600 hover:bg-green-700">
            <Printer className="w-4 h-4 mr-2" />Drukuj / PDF
          </Button>
        </div>

        {/* Print-only title */}
        <div className="hidden print:block">
          <h1 className="text-base font-bold">{farmName || 'Plantacja'}</h1>
          <p className="text-xs text-gray-500">{today.toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">Ładowanie...</div>
        ) : rows.length === 0 ? (
          <div className="text-gray-500">Brak danych do wyświetlenia.</div>
        ) : (
          <>
            {/* ── Polish version ─────────────────────────── */}
            <section className="space-y-2">
              <div className="flex items-center gap-2 print-hidden">
                <span className="text-base leading-none">🇵🇱</span>
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Wersja polska</h2>
              </div>
              <SummaryTable rows={rows} lang="pl" totals={totals} colorMap={colorMap} />
            </section>

            {/* ── Divider ───────────────────────────────── */}
            <div className="relative print:mt-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t-2 border-dashed border-gray-200" /></div>
              <div className="relative flex justify-center">
                <span className="bg-white px-4 text-xs text-gray-400 uppercase tracking-widest print-hidden">English version below</span>
              </div>
            </div>

            {/* ── English version ─────────────────────────── */}
            <section className="space-y-2">
              <div className="flex items-center gap-2 print-hidden">
                <span className="text-base leading-none">🇬🇧</span>
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">English version</h2>
              </div>
              <SummaryTable rows={rows} lang="en" totals={totalsEn} colorMap={colorMap} />
            </section>

            {/* ── Footer note ──────────────────────────────── */}
            <p className="text-xs text-gray-400 print-hidden pb-4">
              {rows.length} sekcji · {totalMeters.toLocaleString('pl-PL')} mb · {Math.round(totalPots).toLocaleString('pl-PL')} doniczek · {Math.round(totalShoots).toLocaleString('pl-PL')} pędów
            </p>
          </>
        )}
      </div>
    </>
  )
}
