import { prisma } from '@/lib/prisma'
import { requireTenantId } from '@/lib/tenant'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const fail = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback
  return NextResponse.json({ error: message }, { status: message.includes('Unauthorized') ? 401 : 500 })
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenantId = await requireTenantId()
    const { id } = await params
    const scenario = await prisma.plantingScenario.findFirst({
      where: { id, tenantId },
      include: { items: true, plugPlans: true },
    })
    if (!scenario) return NextResponse.json({ error: 'Nie znaleziono scenariusza' }, { status: 404 })
    return NextResponse.json({ scenario })
  } catch (error) {
    return fail(error, 'Failed to fetch scenario')
  }
}

/** PATCH — aktualizuje tylko pola obecne w body (wzorzec z /api/varieties/[id]). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenantId = await requireTenantId()
    const { id } = await params
    const body = await request.json()

    const existing = await prisma.plantingScenario.findFirst({ where: { id, tenantId } })
    if (!existing) return NextResponse.json({ error: 'Nie znaleziono scenariusza' }, { status: 404 })

    const data: Record<string, unknown> = {}
    if ('name' in body) {
      if (!body.name || !String(body.name).trim()) {
        return NextResponse.json({ error: 'Nazwa scenariusza jest wymagana' }, { status: 400 })
      }
      data.name = String(body.name).trim()
    }
    if ('description' in body) data.description = body.description ? String(body.description) : null
    if ('startYear' in body) data.startYear = Number(body.startYear)
    if ('endYear' in body) data.endYear = Number(body.endYear)
    if ('isArchived' in body) data.isArchived = Boolean(body.isArchived)

    const startYear = (data.startYear as number) ?? existing.startYear
    const endYear = (data.endYear as number) ?? existing.endYear
    if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || endYear < startYear) {
      return NextResponse.json({ error: 'Nieprawidłowy zakres lat' }, { status: 400 })
    }

    const scenario = await prisma.plantingScenario.update({
      where: { id },
      data,
      include: { items: true, plugPlans: true },
    })
    return NextResponse.json({ scenario })
  } catch (error) {
    return fail(error, 'Failed to update scenario')
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenantId = await requireTenantId()
    const { id } = await params
    const existing = await prisma.plantingScenario.findFirst({ where: { id, tenantId } })
    if (!existing) return NextResponse.json({ error: 'Nie znaleziono scenariusza' }, { status: 404 })
    await prisma.plantingScenario.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return fail(error, 'Failed to delete scenario')
  }
}
