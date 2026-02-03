import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET - pobierz pracowników
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const farmId = searchParams.get('farmId')

    if (!farmId) {
      const farm = await prisma.farm.findFirst()
      if (!farm) {
        return NextResponse.json({ workers: [] })
      }
      
      const workers = await prisma.worker.findMany({
        where: { farmId: farm.id },
        orderBy: { name: 'asc' }
      })
      return NextResponse.json({ workers })
    }

    const workers = await prisma.worker.findMany({
      where: { farmId },
      orderBy: { name: 'asc' }
    })

    return NextResponse.json({ workers })
  } catch (error) {
    console.error('Error fetching workers:', error)
    return NextResponse.json({ error: 'Failed to fetch workers' }, { status: 500 })
  }
}

// POST - zapisz pracownika
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { worker, farmId } = body

    if (!farmId) {
      return NextResponse.json({ error: 'farmId is required' }, { status: 400 })
    }

    const newWorker = await prisma.worker.create({
      data: {
        name: worker.name,
        phone: worker.phone || null,
        efficiencyKgH: worker.efficiency || 8,
        isActive: worker.status === 'active',
        farmId,
      }
    })

    return NextResponse.json({ worker: newWorker })
  } catch (error) {
    console.error('Error creating worker:', error)
    return NextResponse.json({ error: 'Failed to create worker' }, { status: 500 })
  }
}
