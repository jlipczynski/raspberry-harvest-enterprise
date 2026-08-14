import { prisma } from '@/lib/prisma'
import { requireTenantId } from '@/lib/tenant'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const fail = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback
  return NextResponse.json({ error: message }, { status: message.includes('Unauthorized') ? 401 : 500 })
}

/** GET — lista sposobów obsadzania gospodarstwa. */
export async function GET() {
  try {
    const tenantId = await requireTenantId()
    const methods = await prisma.plantingMethodDef.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    })
    return NextResponse.json({ methods })
  } catch (error) {
    return fail(error, 'Failed to fetch planting methods')
  }
}

/**
 * PUT — zapis całej listy.
 * body: { methods: [{ code, label, hint?, buysLongCane, growsFromOwnPlug, usesCoco,
 *                     hasPlantingLabour, defaultSummer, defaultAutumn, sortOrder, isActive }] }
 * Sposoby usunięte z listy są kasowane, o ile żaden scenariusz ich nie używa.
 */
export async function PUT(request: NextRequest) {
  try {
    const tenantId = await requireTenantId()
    const body = await request.json()

    if (!Array.isArray(body.methods)) {
      return NextResponse.json({ error: 'Pole methods jest wymagane' }, { status: 400 })
    }

    const rows = body.methods as Record<string, unknown>[]
    const codes = rows.map(m => String(m.code ?? '').trim())

    for (const [i, raw] of rows.entries()) {
      if (!codes[i]) return NextResponse.json({ error: 'Każdy sposób wymaga kodu' }, { status: 400 })
      if (!/^[A-Z0-9_]+$/.test(codes[i])) {
        return NextResponse.json(
          { error: `Kod „${codes[i]}" może zawierać tylko wielkie litery, cyfry i podkreślenie` },
          { status: 400 }
        )
      }
      if (!String(raw.label ?? '').trim()) {
        return NextResponse.json({ error: `Sposób „${codes[i]}" wymaga nazwy` }, { status: 400 })
      }
    }
    if (new Set(codes).size !== codes.length) {
      return NextResponse.json({ error: 'Kody sposobów muszą być unikalne' }, { status: 400 })
    }

    // nie kasujemy sposobu, którego używa jakikolwiek scenariusz — inaczej
    // pozycje scenariusza zostałyby bez definicji kosztu
    const existing = await prisma.plantingMethodDef.findMany({ where: { tenantId }, select: { code: true } })
    const removed = existing.map(e => e.code).filter(code => !codes.includes(code))
    if (removed.length > 0) {
      const inUse = await prisma.plantingScenarioItem.findMany({
        where: { method: { in: removed }, scenario: { tenantId } },
        select: { method: true },
        distinct: ['method'],
      })
      if (inUse.length > 0) {
        return NextResponse.json(
          { error: `Nie można usunąć — w scenariuszach użyto: ${inUse.map(x => x.method).join(', ')}. Odznacz „aktywny", żeby ukryć sposób bez kasowania.` },
          { status: 409 }
        )
      }
      await prisma.plantingMethodDef.deleteMany({ where: { tenantId, code: { in: removed } } })
    }

    for (const [i, raw] of rows.entries()) {
      const data = {
        label: String(raw.label).trim(),
        hint: raw.hint ? String(raw.hint) : null,
        buysLongCane: Boolean(raw.buysLongCane),
        growsFromOwnPlug: Boolean(raw.growsFromOwnPlug),
        usesCoco: Boolean(raw.usesCoco),
        hasPlantingLabour: Boolean(raw.hasPlantingLabour),
        defaultSummer: Boolean(raw.defaultSummer),
        defaultAutumn: Boolean(raw.defaultAutumn),
        sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : i * 10,
        isActive: raw.isActive === undefined ? true : Boolean(raw.isActive),
      }
      await prisma.plantingMethodDef.upsert({
        where: { tenantId_code: { tenantId, code: codes[i] } },
        create: { tenantId, code: codes[i], ...data },
        update: data,
      })
    }

    const methods = await prisma.plantingMethodDef.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    })
    return NextResponse.json({ methods })
  } catch (error) {
    console.error('Error saving planting methods:', error)
    return fail(error, 'Failed to save planting methods')
  }
}
