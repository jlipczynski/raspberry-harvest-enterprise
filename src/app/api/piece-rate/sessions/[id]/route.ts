import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePieceRateContext, PieceRateAccessError } from '@/lib/piece-rate-access'
import { sessionSchema, buildSessionData } from '@/lib/piece-rate-session'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = await requirePieceRateContext()
    const { id } = await params

    // tenantId w warunku, żeby nie dało się odczytać cudzej sesji po ID.
    const session = await prisma.pieceRateSession.findFirst({
      where: { id, tenantId },
      include: { rows: { orderBy: { kgPerHour: 'desc' } } },
    })

    if (!session) {
      return NextResponse.json({ error: 'Nie znaleziono sesji' }, { status: 404 })
    }

    return NextResponse.json({ session })
  } catch (error) {
    if (error instanceof PieceRateAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[piece-rate/sessions/[id] GET] Error:', error)
    return NextResponse.json({ error: 'Nie udało się pobrać sesji' }, { status: 500 })
  }
}

/**
 * Nadpisuje zapisaną sesję. Wiersze wymieniamy w całości — sesja to zdjęcie
 * jednego dnia, więc częściowa aktualizacja nie miałaby sensu.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = await requirePieceRateContext()
    const { id } = await params

    const existing = await prisma.pieceRateSession.findFirst({
      where: { id, tenantId },
      select: { id: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Nie znaleziono sesji' }, { status: 404 })
    }

    const parsed = sessionSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Nieprawidłowe dane', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const built = buildSessionData(parsed.data)
    if (built === null) {
      return NextResponse.json(
        { error: 'Nie da się policzyć stawki — brak pracowników wzorcowych z dodatnimi godzinami' },
        { status: 400 }
      )
    }

    // Wymiana wierszy i zapis nagłówka w jednej transakcji, żeby edycja nie
    // mogła zostawić sesji ze starymi wierszami i nową stawką.
    const session = await prisma.$transaction(async (tx) => {
      await tx.pieceRateRow.deleteMany({ where: { sessionId: id } })
      return tx.pieceRateSession.update({
        where: { id },
        data: {
          ...built.scalars,
          rows: { create: built.rowData },
        },
        include: { _count: { select: { rows: true } } },
      })
    })

    return NextResponse.json({ session: { ...session, workerCount: session._count.rows } })
  } catch (error) {
    if (error instanceof PieceRateAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[piece-rate/sessions/[id] PATCH] Error:', error)
    return NextResponse.json({ error: 'Nie udało się zapisać zmian' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = await requirePieceRateContext()
    const { id } = await params

    const existing = await prisma.pieceRateSession.findFirst({
      where: { id, tenantId },
      select: { id: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Nie znaleziono sesji' }, { status: 404 })
    }

    // Wiersze znikają kaskadowo (onDelete: Cascade).
    await prisma.pieceRateSession.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof PieceRateAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[piece-rate/sessions/[id] DELETE] Error:', error)
    return NextResponse.json({ error: 'Nie udało się usunąć sesji' }, { status: 500 })
  }
}
