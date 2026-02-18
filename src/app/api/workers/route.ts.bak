import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const tenantId = await requireTenantId()
    const farm = await prisma.farm.findFirst({ where: { tenantId } })
    if (!farm) {
      return NextResponse.json({ workers: [] })
    }
    const workers = await prisma.worker.findMany({
      where: { farmId: farm.id },
      orderBy: { name: 'asc' }
    })
    return NextResponse.json({ workers })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = await requireTenantId()
    const body = await request.json()
    let farm = await prisma.farm.findFirst({ where: { tenantId } })
    if (!farm) {
      farm = await prisma.farm.create({ data: { name: 'Plantacja', tenantId } })
    }
    const worker = await prisma.worker.create({
      data: {
        name: body.name,
        phone: body.phone || null,
        nationality: body.nationality || null,
        efficiency: body.efficiency || 1.0,
        isActive: body.isActive !== false,
        farmId: farm.id,
      }
    })
    return NextResponse.json({ worker })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
