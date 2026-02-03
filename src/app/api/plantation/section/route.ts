import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { section } = body

    const newSection = await prisma.section.create({
      data: {
        name: section.name,
        rowsCount: section.rowsCount,
        rowLengthM: section.rowLengthM,
        plantSpacing: section.plantSpacing,
        plantsCount: section.plantsCount,
        blockId: section.blockId,
        varietyId: section.varietyId,
      }
    })

    return NextResponse.json({ section: newSection })
  } catch (error) {
    console.error('Error creating section:', error)
    return NextResponse.json({ error: 'Failed to create section' }, { status: 500 })
  }
}
