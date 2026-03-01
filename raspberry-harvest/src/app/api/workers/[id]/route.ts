import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireTenantId()
    const { id } = await params
    const worker = await prisma.worker.findUnique({ where: { id } })
    if (!worker) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ worker })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireTenantId()
    const { id } = await params
    const body = await request.json()

    const data: any = { ...body }
    const dateFields = ['availableFrom', 'availableTo', 'suggestedArrival', 'confirmedArrival']
    for (const field of dateFields) {
      if (data[field] !== undefined) {
        data[field] = data[field] ? new Date(data[field]) : null
      }
    }

    const worker = await prisma.worker.update({
      where: { id },
      data,
    })
    return NextResponse.json({ worker })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireTenantId()
    const { id } = await params
    await prisma.worker.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
