import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePieceRateContext, PieceRateAccessError } from '@/lib/piece-rate-access'

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
