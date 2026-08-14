import { prisma } from '@/lib/prisma'
import { requireTenantId } from '@/lib/tenant'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const fail = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback
  return NextResponse.json({ error: message }, { status: message.includes('Unauthorized') ? 401 : 500 })
}

const load = (tenantId: string) =>
  prisma.costItem.findMany({
    where: { tenantId },
    orderBy: [{ year: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
  })

/** GET — wszystkie pozycje cennika tenanta, ze wszystkich lat. Rok 0 = cennik bazowy. */
export async function GET() {
  try {
    const tenantId = await requireTenantId()
    return NextResponse.json({ items: await load(tenantId) })
  } catch (error) {
    return fail(error, 'Failed to fetch cost book')
  }
}

/**
 * PUT — zapis cennika jednego roku w całości.
 * body: { year, items: [{ key, varietyId?, label, category, unit, valuePln, valueEur, sortOrder, note }] }
 * Pozycje tego roku nieobecne w przesłanej liście są kasowane.
 */
export async function PUT(request: NextRequest) {
  try {
    const tenantId = await requireTenantId()
    const body = await request.json()

    if (!Array.isArray(body.items)) {
      return NextResponse.json({ error: 'Pole items jest wymagane' }, { status: 400 })
    }

    // 0 = cennik bazowy; każdy inny rok to nadpisanie na ten konkretny rok
    const year = Number.isInteger(Number(body.year)) ? Number(body.year) : 0
    if (year !== 0 && (year < 2000 || year > 2100)) {
      return NextResponse.json({ error: 'Nieprawidłowy rok cennika' }, { status: 400 })
    }

    const num = (v: unknown): number | null => {
      if (v === null || v === undefined || v === '') return null
      const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
      return Number.isFinite(n) ? n : null
    }

    const rows = body.items as Record<string, unknown>[]
    for (const raw of rows) {
      if (!raw?.key || !raw?.label) {
        return NextResponse.json({ error: 'Każda pozycja cennika wymaga rodzaju i nazwy' }, { status: 400 })
      }
    }

    // (rodzaj + odmiana) musi być unikalne w roku — inaczej nie wiadomo, która cena obowiązuje
    const seen = new Set<string>()
    for (const raw of rows) {
      const id = `${String(raw.key)}|${String(raw.varietyId ?? '')}`
      if (seen.has(id)) {
        return NextResponse.json(
          { error: `Powtórzona pozycja: „${String(raw.label)}”. Dla jednej odmiany może być tylko jedna cena danego rodzaju.` },
          { status: 400 }
        )
      }
      seen.add(id)
    }

    // odmiany muszą występować na sekcjach tego gospodarstwa
    const varietyIds = [...new Set(rows.map(r => String(r.varietyId ?? '')).filter(Boolean))]
    if (varietyIds.length > 0) {
      const used = await prisma.section.findMany({
        where: { varietyId: { in: varietyIds }, block: { farm: { tenantId } } },
        select: { varietyId: true },
        distinct: ['varietyId'],
      })
      const unknown = varietyIds.filter(id => !used.some(u => u.varietyId === id))
      if (unknown.length > 0) {
        return NextResponse.json(
          { error: 'Któraś z odmian nie występuje na sekcjach tego gospodarstwa' },
          { status: 403 }
        )
      }
    }

    const keep = rows.map(r => ({ key: String(r.key), varietyId: String(r.varietyId ?? '') }))
    const existing = await prisma.costItem.findMany({
      where: { tenantId, year },
      select: { key: true, varietyId: true },
    })
    const toDelete = existing.filter(e => !keep.some(k => k.key === e.key && k.varietyId === e.varietyId))
    if (toDelete.length > 0) {
      await prisma.costItem.deleteMany({
        where: { tenantId, year, OR: toDelete.map(d => ({ key: d.key, varietyId: d.varietyId })) },
      })
    }

    for (const [i, raw] of rows.entries()) {
      const varietyId = String(raw.varietyId ?? '')
      const data = {
        label: String(raw.label),
        category: raw.category ? String(raw.category) : 'general',
        unit: raw.unit ? String(raw.unit) : '',
        // puste pole zapisujemy jako null, NIE jako 0 — inaczej pozycja podana
        // tylko w EUR zostałaby policzona jako zero zamiast przeliczona kursem
        valuePln: num(raw.valuePln),
        valueEur: num(raw.valueEur),
        sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : i * 10,
        note: raw.note ? String(raw.note) : null,
      }
      await prisma.costItem.upsert({
        where: { tenantId_key_year_varietyId: { tenantId, key: String(raw.key), year, varietyId } },
        create: { tenantId, key: String(raw.key), year, varietyId, ...data },
        update: data,
      })
    }

    return NextResponse.json({ items: await load(tenantId) })
  } catch (error) {
    console.error('Error saving cost book:', error)
    return fail(error, 'Failed to save cost book')
  }
}
