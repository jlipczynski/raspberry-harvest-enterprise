import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    // Check if variety has sections
    const sectionsCount = await prisma.section.count({
      where: { varietyId: id }
    })
    
    if (sectionsCount > 0) {
      return NextResponse.json(
        { error: 'Cannot delete variety with existing sections' },
        { status: 400 }
      )
    }
    
    await prisma.variety.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting variety:', error)
    return NextResponse.json({ error: 'Failed to delete variety' }, { status: 500 })
  }
}
