import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getPrisma() {
  return new PrismaClient()
}

export async function GET(request: NextRequest) {
  const prisma = getPrisma()
  
  try {
    const { searchParams } = new URL(request.url)
    const farmId = searchParams.get('farmId')

    if (!farmId) {
      const farm = await prisma.farm.findFirst()
      if (!farm) {
        await prisma.$disconnect()
        return NextResponse.json({ workers: [] })
      }
      
      const workers = await prisma.worker.findMany({
        where: { farmId: farm.id },
        orderBy: { name: 'asc' }
      })
      await prisma.$disconnect()
      return NextResponse.json({ workers })
    }

    const workers = await prisma.worker.findMany({
      where: { farmId },
      orderBy: { name: 'asc' }
    })

    await prisma.$disconnect()
    return NextResponse.json({ workers })
  } catch (error) {
    await prisma.$disconnect()
    console.error('Error fetching workers:', error)
    return NextResponse.json({ error: 'Failed to fetch workers' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const prisma = getPrisma()
  
  try {
    const body = await request.json()
    const { worker, farmId } = body

    if (!farmId) {
      await prisma.$disconnect()
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

    await prisma.$disconnect()
    return NextResponse.json({ worker: newWorker })
  } catch (error) {
    await prisma.$disconnect()
    console.error('Error creating worker:', error)
    return NextResponse.json({ error: 'Failed to create worker' }, { status: 500 })
  }
}
