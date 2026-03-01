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
      orderBy: [{ status: 'asc' }, { lastName: 'asc' }]
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
        firstName: body.firstName,
        lastName: body.lastName,
        passport: body.passport || null,
        passportFileUrl: body.passportFileUrl || null,
        availableFrom: body.availableFrom ? new Date(body.availableFrom) : null,
        availableTo: body.availableTo ? new Date(body.availableTo) : null,
        suggestedArrival: body.suggestedArrival ? new Date(body.suggestedArrival) : null,
        confirmedArrival: body.confirmedArrival ? new Date(body.confirmedArrival) : null,
        referredBy: body.referredBy || null,
        yearsAtPlantation: body.yearsAtPlantation || 0,
        status: body.status || 'new',
        acceptedToList: body.acceptedToList || false,
        acceptedToListMsg: body.acceptedToListMsg || null,
        arrivalConfirmed: body.arrivalConfirmed || false,
        arrivalConfirmMsg: body.arrivalConfirmMsg || null,
        whatsapp: body.whatsapp || null,
        viber: body.viber || null,
        phone: body.phone || null,
        efficiencyKgH: body.efficiencyKgH || 8.0,
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
