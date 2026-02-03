import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    await prisma.worker.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting worker:', error)
    return NextResponse.json({ error: 'Failed to delete worker' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    
    const worker = await prisma.worker.update({
      where: { id },
      data: {
        isActive: body.isActive
      }
    })

    return NextResponse.json({ worker })
  } catch (error) {
    console.error('Error updating worker:', error)
    return NextResponse.json({ error: 'Failed to update worker' }, { status: 500 })
  }
}
