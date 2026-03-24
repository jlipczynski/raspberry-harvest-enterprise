'use client'

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ── Types (mirrored from gdh-module) ──

interface SectionGdh {
  id: string
  name: string
  blockName: string
  varietyName: string
  winteredInTunnel: boolean
  gdhStartDate: string | null
  baseTemp: number
  plantMaterialType: string | null
  flowerThreshold: number | null
  fruitThreshold: number | null
  thresholdType: string
  dailyGdh: Array<{ date: string; dailyGdh: number; cumulativeGdh: number; readingCount: number }>
  currentGdh: number
  totalReadings: number
}

interface ForecastDay {
  date: string
  gdhTunnel: number
  avgTunnelTemp?: number
}

interface SeasonalAnomaly {
  months: Array<{ month: string; anomaly: number }>
  avgAnomaly: number
  verdict: string
}

interface Forecast {
  meteoDays: ForecastDay[]
  scenarios: { p10: ForecastDay[]; p50: ForecastDay[]; p90: ForecastDay[]; best: ForecastDay[] }
  seasonalAnomaly: SeasonalAnomaly | null
  lastForecastDate: string
  tunnelModel: { alpha: number; offsetModel: string; staticOffset: number | null; maxOffset: number; radiationK: number }
  historicalYears: number
}

interface GdhParams {
  baseTemp?: number
  upperTemp: number
}

// ── Colors (RGB) ──

const C = {
  green:     [5, 150, 105] as [number, number, number],
  greenBg:   [236, 253, 245] as [number, number, number],
  greenLight: [209, 250, 229] as [number, number, number],
  blue:      [59, 130, 246] as [number, number, number],
  blueBg:    [219, 234, 254] as [number, number, number],
  rose:      [225, 29, 72] as [number, number, number],
  roseBg:    [255, 228, 230] as [number, number, number],
  orange:    [249, 115, 22] as [number, number, number],
  orangeBg:  [255, 237, 213] as [number, number, number],
  purple:    [139, 92, 246] as [number, number, number],
  purpleBg:  [237, 233, 254] as [number, number, number],
  sky:       [14, 165, 233] as [number, number, number],
  skyBg:     [224, 242, 254] as [number, number, number],
  amber:     [217, 119, 6] as [number, number, number],
  amberBg:   [254, 243, 199] as [number, number, number],
  red:       [220, 38, 38] as [number, number, number],
  redBg:     [254, 226, 226] as [number, number, number],
  gray:      [107, 114, 128] as [number, number, number],
  grayLight: [229, 231, 235] as [number, number, number],
  dark:      [31, 41, 55] as [number, number, number],
  white:     [255, 255, 255] as [number, number, number],
}

// ── Helper: format date in Polish ──

function fmtDate(d: string | Date): string {
  return new Date(d).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
}

function fmtShort(d: string | Date): string {
  return new Date(d).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })
}

function num(n: number): string {
  return n.toLocaleString('pl-PL')
}

// ── Helper: find threshold crossing date ──

function findCrossingDate(
  section: SectionGdh,
  forecast: Forecast | null,
  threshold: number | null,
  scenarioKey: 'p10' | 'p50' | 'p90' | 'best'
): string | null {
  if (!threshold) return null

  // Check real data first
  for (const d of section.dailyGdh) {
    if (d.cumulativeGdh >= threshold) {
      return fmtDate(d.date)
    }
  }

  if (!forecast) return null

  // Per-section GDH from tunnel temp
  const GDH_UPPER = 26.0
  const gdhFromDay = (day: ForecastDay): number => {
    if (day.avgTunnelTemp != null) {
      const eff = Math.min(day.avgTunnelTemp, GDH_UPPER)
      return Math.max(0, eff - section.baseTemp) * 24
    }
    return day.gdhTunnel
  }

  // Check meteo
  let cum = section.currentGdh
  for (const day of forecast.meteoDays) {
    cum += gdhFromDay(day)
    if (cum >= threshold) return fmtDate(day.date)
  }

  // Check scenario
  const scenarioData = forecast.scenarios[scenarioKey] || []
  let cumS = cum
  for (const day of scenarioData) {
    cumS += gdhFromDay(day)
    if (cumS >= threshold) return fmtDate(day.date)
  }

  return null
}

// ── Helper: draw a progress bar ──

function drawProgressBar(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  pct: number,
  fillColor: [number, number, number],
  bgColor: [number, number, number]
) {
  doc.setFillColor(...bgColor)
  doc.roundedRect(x, y, w, h, h / 2, h / 2, 'F')
  if (pct > 0) {
    doc.setFillColor(...fillColor)
    doc.roundedRect(x, y, Math.max(h, w * Math.min(pct, 100) / 100), h, h / 2, h / 2, 'F')
  }
}

// ── Helper: draw a colored badge ──

function drawBadge(
  doc: jsPDF,
  text: string,
  x: number, y: number,
  textColor: [number, number, number],
  bgColor: [number, number, number]
) {
  const tw = doc.getTextWidth(text) + 6
  doc.setFillColor(...bgColor)
  doc.roundedRect(x, y - 3.5, tw, 5.5, 2, 2, 'F')
  doc.setTextColor(...textColor)
  doc.setFontSize(7)
  doc.text(text, x + 3, y)
}

// ── Main: generate PDF ──

export function generateGdhReport(
  sections: SectionGdh[],
  forecast: Forecast | null,
  gdhParams: GdhParams
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()
  const margin = 12
  const contentW = pw - margin * 2

  const sectionsWithData = sections.filter(s => s.totalReadings > 0)
  const now = new Date()
  const dateStr = now.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  // ═══════════════════════════════════════════
  // PAGE 1: COVER + OVERVIEW
  // ═══════════════════════════════════════════

  // Header gradient bar
  doc.setFillColor(5, 150, 105)
  doc.rect(0, 0, pw, 28, 'F')
  doc.setFillColor(4, 120, 87)
  doc.rect(0, 24, pw, 4, 'F')

  // Title
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text('RAPORT GDH — Godziny Wzrostu', margin, 14)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Growing Degree Hours Report  |  ${dateStr}`, margin, 22)

  // Parameters strip
  doc.setFillColor(236, 253, 245)
  doc.rect(0, 28, pw, 10, 'F')
  doc.setTextColor(4, 120, 87)
  doc.setFontSize(8)
  doc.text(`T_baz = per-sekcja  |  T_opt = ${gdhParams.upperTemp}°C  |  Metodologia: Fall Creek Nursery`, margin, 34)

  if (forecast) {
    const offsetDesc = forecast.tunnelModel.offsetModel === 'static'
      ? `stały +${forecast.tunnelModel.staticOffset}°C`
      : `dynamiczny 0–${forecast.tunnelModel.maxOffset}°C (promieniowanie)`
    const fInfo = `Klimatologia: ${forecast.historicalYears} lat  |  Tunel: α=${forecast.tunnelModel.alpha}, offset ${offsetDesc}`
    doc.text(fInfo, pw / 2, 34)

    if (forecast.seasonalAnomaly) {
      const a = forecast.seasonalAnomaly
      const aText = `ECMWF 2026: ${a.verdict} (${a.avgAnomaly > 0 ? '+' : ''}${a.avgAnomaly}K)`
      drawBadge(doc, aText, pw - margin - doc.getTextWidth(aText) - 8, 34, a.avgAnomaly > 0.5 ? C.orange : a.avgAnomaly < -0.5 ? C.sky : C.gray, a.avgAnomaly > 0.5 ? C.orangeBg : a.avgAnomaly < -0.5 ? C.skyBg : C.grayLight)
    }
  }

  let y = 44

  // ── Summary cards ──
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C.dark)
  doc.text('Podsumowanie plantacji', margin, y)
  y += 7

  const cardW = (contentW - 12) / 4
  const cards = [
    { label: 'Sekcji z danymi', value: String(sectionsWithData.length), sub: `z ${sections.length} ogółem`, color: C.green, bg: C.greenBg },
    { label: 'Łączne pomiary', value: num(sectionsWithData.reduce((s, sec) => s + sec.totalReadings, 0)), sub: 'odczytów temperatury', color: C.blue, bg: C.blueBg },
    { label: 'Zakres GDH', value: sectionsWithData.length > 0 ? `${num(Math.min(...sectionsWithData.map(s => s.currentGdh)))} – ${num(Math.max(...sectionsWithData.map(s => s.currentGdh)))}` : '–', sub: 'min – max', color: C.purple, bg: C.purpleBg },
    { label: 'Śr. GDH', value: sectionsWithData.length > 0 ? num(Math.round(sectionsWithData.reduce((s, sec) => s + sec.currentGdh, 0) / sectionsWithData.length)) : '–', sub: 'średnia sekcji', color: C.orange, bg: C.orangeBg },
  ]

  cards.forEach((card, i) => {
    const cx = margin + i * (cardW + 4)
    doc.setFillColor(...card.bg)
    doc.roundedRect(cx, y, cardW, 22, 3, 3, 'F')
    doc.setTextColor(...card.color)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text(card.label, cx + 4, y + 5.5)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(card.value, cx + 4, y + 14)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.gray)
    doc.text(card.sub, cx + 4, y + 19)
  })

  y += 30

  // ── Overview table ──
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C.dark)
  doc.text('Wszystkie sekcje — przegląd', margin, y)
  y += 4

  const tableBody = sectionsWithData.map(s => {
    const flPct = s.flowerThreshold ? Math.min(100, Math.round((s.currentGdh / s.flowerThreshold) * 100)) : null
    const frPct = s.fruitThreshold ? Math.min(100, Math.round((s.currentGdh / s.fruitThreshold) * 100)) : null
    const typ = s.winteredInTunnel ? 'Zimowana' : s.plantMaterialType === 'LONGCANE' ? 'Long cane' : 'Jesienna'
    const startInfo = s.gdhStartDate ? `od ${fmtShort(s.gdhStartDate)}` : ''

    return [
      `${s.blockName} / ${s.name}${startInfo ? `\n${startInfo}` : ''}`,
      s.varietyName,
      typ,
      num(s.currentGdh),
      s.flowerThreshold ? `${flPct}%  (próg: ${num(s.flowerThreshold)})` : '—',
      s.fruitThreshold ? `${frPct}%  (próg: ${num(s.fruitThreshold)})` : '—',
      num(s.totalReadings),
    ]
  })

  autoTable(doc, {
    startY: y,
    head: [['Blok / Sekcja', 'Odmiana', 'Typ', 'GDH', 'Kwitnienie', 'Owocowanie', 'Pomiary']],
    body: tableBody,
    theme: 'grid',
    headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 7.5, textColor: [31, 41, 55] },
    alternateRowStyles: { fillColor: [245, 250, 245] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 42 },
      1: { cellWidth: 30 },
      2: { cellWidth: 22 },
      3: { halign: 'right', fontStyle: 'bold', cellWidth: 22 },
      4: { halign: 'right', cellWidth: 38 },
      5: { halign: 'right', cellWidth: 38 },
      6: { halign: 'right', cellWidth: 22 },
    },
    margin: { left: margin, right: margin },
    didParseCell: (data) => {
      // Color progress cells
      if (data.section === 'body') {
        if (data.column.index === 4) {
          const pct = parseInt(data.cell.raw as string)
          if (!isNaN(pct)) {
            data.cell.styles.textColor = pct >= 100 ? [217, 119, 6] : [107, 114, 128]
            if (pct >= 100) data.cell.styles.fontStyle = 'bold'
          }
        }
        if (data.column.index === 5) {
          const pct = parseInt(data.cell.raw as string)
          if (!isNaN(pct)) {
            data.cell.styles.textColor = pct >= 100 ? [220, 38, 38] : [107, 114, 128]
            if (pct >= 100) data.cell.styles.fontStyle = 'bold'
          }
        }
      }
    },
  })

  // ═══════════════════════════════════════════
  // SECTION DETAIL PAGES
  // ═══════════════════════════════════════════

  for (const section of sectionsWithData) {
    doc.addPage('landscape')

    // ── Section header ──
    doc.setFillColor(5, 150, 105)
    doc.rect(0, 0, pw, 20, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(`${section.blockName} / ${section.name}`, margin, 12)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(section.varietyName, margin + doc.getTextWidth(`${section.blockName} / ${section.name}  `) + 6, 12)

    // Right side: big GDH number
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    const gdhText = `${num(section.currentGdh)} GDH`
    doc.text(gdhText, pw - margin - doc.getTextWidth(gdhText), 13)

    y = 26

    // ── Info cards row ──
    const infoCards: Array<{ label: string; value: string; color: [number, number, number]; bg: [number, number, number] }> = [
      { label: 'Typ', value: section.winteredInTunnel ? 'Zimowana w tunelu' : section.plantMaterialType === 'LONGCANE' ? 'Long canes' : 'Sezon jesienny', color: C.green, bg: C.greenBg },
      { label: 'Pomiary', value: num(section.totalReadings), color: C.blue, bg: C.blueBg },
      { label: 'Próg kwitnienia', value: section.flowerThreshold ? `${num(section.flowerThreshold)} GDH` : 'Nie ustawiony', color: C.amber, bg: C.amberBg },
      { label: 'Próg owocowania', value: section.fruitThreshold ? `${num(section.fruitThreshold)} GDH` : 'Nie ustawiony', color: C.red, bg: C.redBg },
    ]
    if (section.gdhStartDate) {
      infoCards.splice(1, 0, { label: 'GDH od (wysadzenie)', value: fmtDate(section.gdhStartDate), color: C.purple, bg: C.purpleBg })
    }

    const icW = (contentW - (infoCards.length - 1) * 4) / infoCards.length
    infoCards.forEach((card, i) => {
      const cx = margin + i * (icW + 4)
      doc.setFillColor(...card.bg)
      doc.roundedRect(cx, y, icW, 14, 2, 2, 'F')
      doc.setTextColor(...card.color)
      doc.setFontSize(6.5)
      doc.setFont('helvetica', 'normal')
      doc.text(card.label, cx + 3, y + 4.5)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text(card.value, cx + 3, y + 11)
    })

    y += 20

    // ── Progress bars ──
    if (section.flowerThreshold || section.fruitThreshold) {
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...C.dark)
      doc.text('Postęp', margin, y)
      y += 4

      if (section.flowerThreshold) {
        const pct = Math.min(100, Math.round((section.currentGdh / section.flowerThreshold) * 100))
        doc.setFillColor(...C.amberBg)
        doc.roundedRect(margin, y, contentW, 10, 2, 2, 'F')

        doc.setTextColor(...C.amber)
        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.text('Kwitnienie', margin + 3, y + 4)
        doc.setFont('helvetica', 'normal')
        doc.text(`${num(section.currentGdh)} / ${num(section.flowerThreshold)} GDH`, margin + 3, y + 8)

        // Bar
        const barX = margin + 60
        const barW = contentW - 80
        drawProgressBar(doc, barX, y + 3, barW, 4, pct, C.amber, [254, 243, 199])

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(12)
        doc.text(`${pct}%`, pw - margin - 12, y + 7)
        y += 13
      }

      if (section.fruitThreshold) {
        const pct = Math.min(100, Math.round((section.currentGdh / section.fruitThreshold) * 100))
        doc.setFillColor(...C.redBg)
        doc.roundedRect(margin, y, contentW, 10, 2, 2, 'F')

        doc.setTextColor(...C.red)
        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.text('Owocowanie', margin + 3, y + 4)
        doc.setFont('helvetica', 'normal')
        doc.text(`${num(section.currentGdh)} / ${num(section.fruitThreshold)} GDH`, margin + 3, y + 8)

        const barX = margin + 60
        const barW = contentW - 80
        drawProgressBar(doc, barX, y + 3, barW, 4, pct, C.red, [254, 226, 226])

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(12)
        doc.text(`${pct}%`, pw - margin - 12, y + 7)
        y += 13
      }
    }

    y += 2

    // ── Scenario predictions table ──
    if (forecast && (section.flowerThreshold || section.fruitThreshold)) {
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...C.dark)
      doc.text('Prognoza dat kwitnienia i owocowania', margin, y)
      y += 2

      const hasBest = forecast.scenarios.best && forecast.scenarios.best.length > 0
      const scenarios: Array<{
        label: string
        key: 'best' | 'p90' | 'p50' | 'p10'
        textColor: [number, number, number]
        rowBg: [number, number, number]
      }> = []

      if (hasBest) {
        const anom = forecast.seasonalAnomaly
        scenarios.push({
          label: `Prognoza 2026 (ECMWF${anom ? `: ${anom.avgAnomaly > 0 ? '+' : ''}${anom.avgAnomaly}K` : ''})`,
          key: 'best', textColor: C.rose, rowBg: C.roseBg,
        })
      }
      scenarios.push(
        { label: 'Ciepły rok (P90)', key: 'p90', textColor: C.orange, rowBg: C.orangeBg },
        { label: 'Przeciętny rok (P50)', key: 'p50', textColor: C.purple, rowBg: C.purpleBg },
        { label: 'Zimny rok (P10)', key: 'p10', textColor: C.sky, rowBg: C.skyBg },
      )

      const head: string[] = ['Scenariusz']
      if (section.flowerThreshold) head.push(`Kwitnienie (${num(section.flowerThreshold)} GDH)`)
      if (section.fruitThreshold) head.push(`Owocowanie (${num(section.fruitThreshold)} GDH)`)

      const body = scenarios.map(sc => {
        const row: string[] = [sc.label]
        if (section.flowerThreshold) {
          row.push(findCrossingDate(section, forecast, section.flowerThreshold, sc.key) ?? 'Poza zasięgiem prognozy')
        }
        if (section.fruitThreshold) {
          row.push(findCrossingDate(section, forecast, section.fruitThreshold, sc.key) ?? 'Poza zasięgiem prognozy')
        }
        return row
      })

      autoTable(doc, {
        startY: y,
        head: [head],
        body,
        theme: 'grid',
        headStyles: { fillColor: [55, 65, 81], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
        bodyStyles: { fontSize: 8, textColor: [31, 41, 55] },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 65 },
        },
        margin: { left: margin, right: margin },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 0) {
            const sc = scenarios[data.row.index]
            if (sc) {
              data.cell.styles.textColor = sc.textColor
              data.cell.styles.fillColor = sc.rowBg
            }
          }
        },
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (doc as any).lastAutoTable.finalY + 6
    }

    // ── Daily GDH table (last 14 days) ──
    if (section.dailyGdh.length > 0) {
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...C.dark)
      doc.text('Ostatnie odczyty GDH (dzienne)', margin, y)
      y += 2

      const lastDays = section.dailyGdh.slice(-14)
      const dailyBody = lastDays.map(d => [
        fmtShort(d.date),
        String(d.readingCount),
        String(d.dailyGdh),
        num(d.cumulativeGdh),
      ])

      autoTable(doc, {
        startY: y,
        head: [['Data', 'Odczytów', 'GDH dzienne', 'GDH kumulat.']],
        body: dailyBody,
        theme: 'striped',
        headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 7.5, textColor: [31, 41, 55] },
        alternateRowStyles: { fillColor: [245, 250, 245] },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { halign: 'right', cellWidth: 22 },
          2: { halign: 'right', fontStyle: 'bold', cellWidth: 25 },
          3: { halign: 'right', fontStyle: 'bold', cellWidth: 28 },
        },
        margin: { left: margin, right: pw / 2 + 10 },
        tableWidth: pw / 2 - margin - 10,
      })

      // Mini GDH chart (simplified bar chart) on the right side
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tableEndY = (doc as any).lastAutoTable.finalY
      const chartX = pw / 2 + 10
      const chartW = pw / 2 - margin - 10
      const chartH = tableEndY - (y + 2) - 6
      const chartY = y + 2

      if (chartH > 15 && lastDays.length > 0) {
        // Chart background
        doc.setFillColor(250, 250, 250)
        doc.roundedRect(chartX, chartY, chartW, chartH + 6, 2, 2, 'F')
        doc.setDrawColor(229, 231, 235)
        doc.roundedRect(chartX, chartY, chartW, chartH + 6, 2, 2, 'S')

        // Title
        doc.setTextColor(...C.dark)
        doc.setFontSize(7)
        doc.setFont('helvetica', 'bold')
        doc.text('GDH dzienne — ostatnie 14 dni', chartX + 3, chartY + 4)

        const maxDaily = Math.max(...lastDays.map(d => d.dailyGdh), 1)
        const barAreaX = chartX + 4
        const barAreaW = chartW - 8
        const barAreaY = chartY + 8
        const barAreaH = chartH - 6
        const barW = Math.min(8, (barAreaW / lastDays.length) * 0.7)
        const gap = barAreaW / lastDays.length

        lastDays.forEach((d, i) => {
          const bh = (d.dailyGdh / maxDaily) * barAreaH
          const bx = barAreaX + i * gap + (gap - barW) / 2
          const by = barAreaY + barAreaH - bh

          // Gradient-like bar with two colors
          doc.setFillColor(16, 185, 129)
          doc.roundedRect(bx, by, barW, bh, 1, 1, 'F')

          // Date label
          doc.setTextColor(...C.gray)
          doc.setFontSize(5)
          doc.text(fmtShort(d.date), bx + barW / 2, barAreaY + barAreaH + 4, { align: 'center' })

          // Value on top
          if (bh > 4) {
            doc.setTextColor(255, 255, 255)
            doc.setFontSize(5)
            doc.text(String(d.dailyGdh), bx + barW / 2, by + 3, { align: 'center' })
          }
        })
      }
    }
  }

  // ═══════════════════════════════════════════
  // ADD PAGE NUMBERS
  // ═══════════════════════════════════════════

  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)

    // Footer line
    doc.setDrawColor(209, 250, 229)
    doc.setLineWidth(0.5)
    doc.line(margin, ph - 8, pw - margin, ph - 8)

    doc.setTextColor(...C.gray)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text(`Raport GDH  |  ${dateStr}`, margin, ph - 4)
    doc.text(`Strona ${i} z ${pageCount}`, pw - margin, ph - 4, { align: 'right' })
  }

  // ── Save ──
  const filename = `Raport_GDH_${now.toISOString().slice(0, 10)}.pdf`
  doc.save(filename)
}
