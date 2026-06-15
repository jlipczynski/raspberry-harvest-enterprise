import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const tenantId = await requireTenantId()
    const farm = await prisma.farm.findFirst({ where: { tenantId } })
    if (!farm) {
      return NextResponse.json({ error: 'Farm not found' }, { status: 404 })
    }

    const preds = await prisma.harvestPrediction.findMany({
      where: { farmId: farm.id },
      include: { block: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { block: { name: 'asc' } }],
    })

    // Group by date
    const byDate = new Map<string, Array<{ block: string; kg: number; gdh: number }>>()
    for (const p of preds) {
      const d = p.date.toISOString().slice(0, 10)
      const arr = byDate.get(d) || []
      arr.push({ block: p.block.name, kg: p.predictedKg, gdh: p.gdhDaily || 0 })
      byDate.set(d, arr)
    }

    const blockNames = [...new Set(preds.map(p => p.block.name))].sort()

    const days: Array<{
      date: string
      dow: string
      blocks: Record<string, number>
      total: number
      gdh: number
      temp: number
    }> = []

    let totalAll = 0
    for (const [date, blocks] of byDate) {
      const dt = new Date(date + 'T12:00:00')
      const dow = dt.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })
      const dayTotal = blocks.reduce((s, b) => s + b.kg, 0)
      totalAll += dayTotal
      const gdh = blocks[0]?.gdh || 0
      const estTemp = gdh > 0 ? Math.round((gdh / 24 + 6) * 10) / 10 : 0

      const blockMap: Record<string, number> = {}
      for (const b of blocks) {
        blockMap[b.block] = b.kg
      }
      days.push({ date, dow, blocks: blockMap, total: dayTotal, gdh, temp: estTemp })
    }

    const maxTotal = Math.max(...days.map(d => d.total))
    function getBarWidth(kg: number) {
      return Math.max(8, Math.round((kg / maxTotal) * 100))
    }

    const blockColors: Record<string, string> = {
      'Blok A': '#2563eb',
      'Blok B': '#dc2626',
      'Blok C': '#16a34a',
      'Blok D': '#d97706',
    }

    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)
    const reportDate = today.toLocaleDateString('pl-PL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })

    const html = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <title>Prognoza zbiorów malin — ${reportDate}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #ffffff;
      color: #1e293b;
      padding: 32px;
    }
    .container { max-width: 780px; margin: 0 auto; }

    .print-bar {
      text-align: center; margin-bottom: 20px;
    }
    .print-bar button {
      background: #15803d; color: #fff; border: none; padding: 10px 28px;
      border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer;
    }
    .print-bar button:hover { background: #166534; }

    .header {
      text-align: center;
      margin-bottom: 28px;
      padding: 24px;
      background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
      border-radius: 12px;
      border: 1px solid #bbf7d0;
    }
    .header h1 { font-size: 22px; font-weight: 800; color: #14532d; margin-bottom: 2px; }
    .header .subtitle { font-size: 12px; color: #16a34a; font-weight: 500; }
    .header .big-total {
      font-size: 60px; font-weight: 900; color: #15803d;
      margin: 12px 0 2px; letter-spacing: -2px; line-height: 1;
    }
    .header .big-total-label { font-size: 14px; color: #6b7280; font-weight: 500; }

    .legend { display: flex; justify-content: center; gap: 20px; margin-bottom: 16px; }
    .legend-item { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #6b7280; font-weight: 500; }
    .legend-dot { width: 10px; height: 10px; border-radius: 50%; }

    .day-card {
      background: #ffffff; border-radius: 10px; padding: 16px 20px;
      margin-bottom: 8px; border: 1px solid #e5e7eb;
    }
    .day-card.today { border-color: #22c55e; border-width: 2px; background: #fafffe; }

    .day-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .day-name { font-size: 13px; font-weight: 600; color: #374151; text-transform: capitalize; display: flex; align-items: center; gap: 6px; }
    .today-badge {
      background: #22c55e; color: #fff; font-size: 8px; font-weight: 700;
      padding: 1px 6px; border-radius: 3px; text-transform: uppercase;
    }
    .day-meta { display: flex; gap: 10px; align-items: center; }
    .day-temp {
      font-size: 11px; color: #d97706; font-weight: 600;
      background: #fffbeb; padding: 1px 6px; border-radius: 4px; border: 1px solid #fde68a;
    }
    .day-gdh {
      font-size: 11px; color: #2563eb; font-weight: 600;
      background: #eff6ff; padding: 1px 6px; border-radius: 4px; border: 1px solid #bfdbfe;
    }

    .day-total-row { display: flex; align-items: center; gap: 14px; margin-bottom: 10px; }
    .day-total-kg { font-size: 36px; font-weight: 900; color: #111827; letter-spacing: -1.5px; min-width: 120px; line-height: 1; }
    .day-total-kg span { font-size: 14px; font-weight: 500; color: #9ca3af; }
    .day-bar { flex: 1; height: 24px; background: #f3f4f6; border-radius: 6px; overflow: hidden; }
    .day-bar-fill { height: 100%; border-radius: 6px; background: linear-gradient(90deg, #4ade80 0%, #16a34a 100%); }

    .blocks-grid { display: flex; gap: 6px; }
    .block-item {
      flex: 1; display: flex; align-items: center; gap: 5px;
      padding: 4px 8px; background: #f9fafb; border-radius: 6px; border: 1px solid #f3f4f6;
    }
    .block-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
    .block-name { font-size: 10px; color: #9ca3af; font-weight: 500; }
    .block-kg { font-size: 12px; font-weight: 700; color: #374151; margin-left: auto; }

    .footer { text-align: center; margin-top: 20px; padding: 10px; color: #d1d5db; font-size: 10px; }

    @media print {
      .print-bar { display: none; }
      body { padding: 16px; }
      .day-card { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="print-bar">
      <button onclick="window.print()">Zapisz jako PDF / Drukuj</button>
    </div>

    <div class="header">
      <h1>PROGNOZA ZBIORÓW MALIN</h1>
      <div class="subtitle">Raport wygenerowany ${reportDate}</div>
      <div class="big-total">${Math.round(totalAll).toLocaleString('pl-PL')}</div>
      <div class="big-total-label">kg w ciągu 7 dni</div>
    </div>

    <div class="legend">
      ${blockNames.map(name => `
        <div class="legend-item">
          <div class="legend-dot" style="background: ${blockColors[name] || '#94a3b8'}"></div>
          ${name}
        </div>
      `).join('')}
    </div>

    ${days.map(day => {
      const isToday = day.date === todayStr
      return `
      <div class="day-card${isToday ? ' today' : ''}">
        <div class="day-header">
          <div class="day-name">
            ${day.dow}
            ${isToday ? '<span class="today-badge">dzisiaj</span>' : ''}
          </div>
          <div class="day-meta">
            ${day.temp > 0 ? `<div class="day-temp">${day.temp} °C</div>` : ''}
            <div class="day-gdh">GDH ${Math.round(day.gdh)}</div>
          </div>
        </div>
        <div class="day-total-row">
          <div class="day-total-kg">${Math.round(day.total)} <span>kg</span></div>
          <div class="day-bar">
            <div class="day-bar-fill" style="width: ${getBarWidth(day.total)}%"></div>
          </div>
        </div>
        <div class="blocks-grid">
          ${blockNames.map(name => `
            <div class="block-item">
              <div class="block-dot" style="background: ${blockColors[name] || '#94a3b8'}"></div>
              <span class="block-name">${name}</span>
              <span class="block-kg">${(day.blocks[name] || 0).toFixed(1)}</span>
            </div>
          `).join('')}
        </div>
      </div>`
    }).join('\n')}

    <div class="footer">
      Raspberry Harvest Enterprise — prognoza oparta na modelu GDH i krzywych zbiorów
    </div>
  </div>
</body>
</html>`

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    })
  } catch (error) {
    console.error('Report generation error:', error)
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}
