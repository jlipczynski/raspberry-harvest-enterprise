import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const farm = await prisma.farm.update({
      where: { id },
      data: {
        name: body.name,
        location: body.location,
        latitude: body.latitude,
        longitude: body.longitude,
        seasonStartDate: body.seasonStartDate ? new Date(body.seasonStartDate) : null
      }
    })

    return NextResponse.json({ farm })
  } catch (error) {
    console.error('Farm update error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const farm = await prisma.farm.findUnique({
      where: { id }
    })

    if (!farm) {
      return NextResponse.json({ error: 'Farm not found' }, { status: 404 })
    }

    return NextResponse.json({ farm })
  } catch (error) {
    console.error('Farm fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch farm' }, { status: 500 })
  }
}
