'use client'

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Printer, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { pl } from 'date-fns/locale'

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

interface SectionRow {
  blockName: string
  section: Section
  pots: number
  shoots: number
}

const LABELS: { key: string; label: string; numeric: boolean }[] = [
  { key: 'blockName',     label: 'Tunel',            numeric: false },
  { key: 'varietyName',   label: 'Odmiana',          numeric: false },
  { key: 'productionYear',label: 'Rok produkcyjny',  numeric: false },
  { key: 'wintered',      label: 'Zimowana',         numeric: false },
  { key: 'plantingDate',  label: 'Data wysadzenia',  numeric: false },
  { key: 'meters',        label: 'Metrów bieżących', numeric: true  },
  { key: 'pots',          label: 'Doniczek',         numeric: true  },
  { key: 'shoots',        label: 'Pędów',            numeric: true  },
  { key: 'plantSource',   label: 'Źródło sadzonek',  numeric: false },
]

function cellValue(key: string, row: SectionRow): string {
  const s = row.section
  switch (key) {
    case 'blockName':      return row.blockName
    case 'varietyName':    return s.variety?.name ?? '-'
    case 'productionYear': return s.productionYear != null ? String(s.productionYear) : '-'
    case 'wintered':       return s.winteredInTunnel ? 'Tak' : 'Nie'
    case 'plantingDate':   return s.plantingDate
      ? format(new Date(s.plantingDate), 'd MMM yyyy', { locale: pl })
      : '-'
    case 'meters':         return s.metersLength.toLocaleString('pl-PL')
    case 'pots':           return Math.round(row.pots).toLocaleString('pl-PL')
    case 'shoots':         return Math.round(row.shoots).toLocaleString('pl-PL')
    case 'plantSource':
      if (s.plantSource === 'OWN') return 'Własne plugi'
      if (s.plantSource === 'NURSERY') return 'Zewnętrzna szkółka'
      return '-'
    default: return '-'
  }
}

export default function PlantationSummaryPage() {
  const [rows, setRows] = useState<SectionRow[]>([])
  const [farmName, setFarmName] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/plantation')
      .then(r => r.json())
      .then((data: { blocks: Block[]; farm: Farm | null }) => {
        const sorted = (data.blocks ?? [])
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name, 'pl'))

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

  const totalMeters = rows.reduce((s, r) => s + r.section.metersLength, 0)
  const totalPots   = rows.reduce((s, r) => s + r.pots, 0)
  const totalShoots = rows.reduce((s, r) => s + r.shoots, 0)

  const totals: Record<string, string> = {
    meters: totalMeters.toLocaleString('pl-PL'),
    pots:   Math.round(totalPots).toLocaleString('pl-PL'),
    shoots: Math.round(totalShoots).toLocaleString('pl-PL'),
  }

  return (
    <>
      <style>{`
        @media print {
          aside, header, .print-hidden { display: none !important; }
          body { margin: 0; }
          .lg\\:ml-64 { margin-left: 0 !important; }
          main { padding: 8px !important; }
          @page { size: landscape; margin: 12mm; }
          table { font-size: 10px; }
          th, td { padding: 3px 5px !important; }
        }
      `}</style>

      <div className="max-w-full space-y-4">
        {/* Header */}
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
          <Button onClick={() => window.print()} className="bg-green-600 hover:bg-green-700 print-hidden">
            <Printer className="w-4 h-4 mr-2" />Drukuj / PDF
          </Button>
        </div>

        {/* Print-only title */}
        <div className="hidden print:block">
          <h1 className="text-lg font-bold">{farmName ? `Plantacja: ${farmName}` : 'Podsumowanie plantacji'}</h1>
          <p className="text-xs text-gray-500">{new Date().toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">Ładowanie...</div>
        ) : rows.length === 0 ? (
          <div className="text-gray-500">Brak danych do wyświetlenia.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-green-600 text-white">
                  <th className="text-left px-3 py-2 font-semibold border-r border-green-500 whitespace-nowrap sticky left-0 bg-green-600 z-10">
                    Właściwość
                  </th>
                  {rows.map(row => (
                    <th key={row.section.id} className="text-center px-3 py-2 font-semibold border-r border-green-500 whitespace-nowrap min-w-[90px]">
                      {row.section.name ?? row.blockName}
                    </th>
                  ))}
                  <th className="text-center px-3 py-2 font-semibold whitespace-nowrap bg-green-700">
                    Suma
                  </th>
                </tr>
              </thead>
              <tbody>
                {LABELS.map(({ key, label, numeric }, idx) => (
                  <tr key={key} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className={`px-3 py-1.5 font-medium text-gray-700 border-r border-gray-200 whitespace-nowrap sticky left-0 z-10 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                      {label}
                    </td>
                    {rows.map(row => (
                      <td
                        key={row.section.id}
                        className={`px-3 py-1.5 border-r border-gray-100 whitespace-nowrap ${numeric ? 'text-right tabular-nums' : 'text-center'}`}
                      >
                        {cellValue(key, row)}
                      </td>
                    ))}
                    <td className={`px-3 py-1.5 font-semibold bg-green-50 ${numeric ? 'text-right tabular-nums text-green-700' : 'text-center text-gray-400'}`}>
                      {numeric ? (totals[key] ?? '-') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <p className="text-xs text-gray-400 print-hidden">
            {rows.length} sekcji · metrów bieżących: {totalMeters.toLocaleString('pl-PL')} · doniczek: {Math.round(totalPots).toLocaleString('pl-PL')} · pędów: {Math.round(totalShoots).toLocaleString('pl-PL')}
          </p>
        )}
      </div>
    </>
  )
}
