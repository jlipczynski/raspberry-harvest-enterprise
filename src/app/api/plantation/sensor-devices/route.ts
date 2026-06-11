import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const tenantId = await requireTenantId()
    const farm = await prisma.farm.findFirst({ where: { tenantId } })
    if (!farm) return NextResponse.json({ devices: [] })

    const devices = await prisma.sensorDevice.findMany({
      where: { farmId: farm.id },
      include: {
        section: {
          include: {
            block: { select: { id: true, name: true } }
          }
        }
      },
      orderBy: [{ serialNumber: 'asc' }, { createdAt: 'asc' }]
    })

    return NextResponse.json({ devices })
  } catch (error) {
    console.error('Error fetching sensor devices:', error)
    return NextResponse.json({ error: 'Failed to fetch sensor devices' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = await requireTenantId()
    const farm = await prisma.farm.findFirst({ where: { tenantId } })
    if (!farm) return NextResponse.json({ error: 'Farm not found' }, { status: 404 })

    const body = await request.json()
    const { serialNumber, name, sectionId } = body

    if (!serialNumber || !sectionId) {
      return NextResponse.json({ error: 'serialNumber and sectionId are required' }, { status: 400 })
    }

    // Verify section belongs to this farm
    const section = await prisma.section.findFirst({
      where: { id: sectionId, block: { farmId: farm.id } }
    })
    if (!section) {
      return NextResponse.json({ error: 'Section not found in this farm' }, { status: 404 })
    }

    const device = await prisma.sensorDevice.create({
      data: {
        serialNumber: serialNumber.trim(),
        name: name?.trim() || null,
        sectionId,
        farmId: farm.id
      },
      include: {
        section: {
          include: {
            block: { select: { id: true, name: true } }
          }
        }
      }
    })

    return NextResponse.json({ device })
  } catch (error) {
    console.error('Error creating sensor device:', error)
    return NextResponse.json({ error: 'Failed to create sensor device' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const tenantId = await requireTenantId()
    const farm = await prisma.farm.findFirst({ where: { tenantId } })
    if (!farm) return NextResponse.json({ error: 'Farm not found' }, { status: 404 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    // Verify device belongs to this farm
    const device = await prisma.sensorDevice.findFirst({
      where: { id, farmId: farm.id }
    })
    if (!device) return NextResponse.json({ error: 'Device not found' }, { status: 404 })

    await prisma.sensorDevice.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting sensor device:', error)
    return NextResponse.json({ error: 'Failed to delete sensor device' }, { status: 500 })
  }
}
