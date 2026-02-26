import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const url = new URL(request.url)
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '100')

    const [readings, total] = await Promise.all([
      prisma.temperatureReading.findMany({
        where: { sectionId: id },
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.temperatureReading.count({
        where: { sectionId: id },
      }),
    ])

    return NextResponse.json({
      readings,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('Error fetching temperature readings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch temperature readings' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const deleted = await prisma.temperatureReading.deleteMany({
      where: { sectionId: id },
    })

    return NextResponse.json({ success: true, deleted: deleted.count })
  } catch (error) {
    console.error('Error deleting temperature readings:', error)
    return NextResponse.json(
      { error: 'Failed to delete temperature readings' },
      { status: 500 }
    )
  }
}
