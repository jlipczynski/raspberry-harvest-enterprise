import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

interface WorkerInput {
  name: string
  efficiency?: number
  status?: 'active' | 'inactive'
}

interface WorkerConfig {
  availableWorkers?: number
  averageEfficiency?: number
  hoursPerDay?: number
}

// GET - pobierz pracowników i konfigurację
export async function GET() {
  try {
    let farm = await prisma.farm.findFirst()
    if (!farm) {
      farm = await prisma.farm.create({
        data: {
          name: 'Plantacja Malin - Wyszynki',
          location: 'Wyszynki, gmina Budzyń',
          latitude: 52.8831,
          longitude: 16.8156,
        }
      })
    }

    const workers = await prisma.worker.findMany({
      where: { farmId: farm.id },
      orderBy: { name: 'asc' }
    })

    const settings = await prisma.settings.findFirst({
      where: { farmId: farm.id }
    })

    return NextResponse.json({ 
      workers,
      config: {
        availableWorkers: settings?.maxWorkers || 80,
        averageEfficiency: settings?.avgEfficiency || 8,
        hoursPerDay: settings?.hoursPerDay || 8,
      }
    })
  } catch (error) {
    console.error('Error fetching workers:', error)
    return NextResponse.json({ error: 'Failed to fetch workers' }, { status: 500 })
  }
}

// POST - zapisz pracowników i konfigurację
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { workers, config } = body as { workers?: WorkerInput[], config?: WorkerConfig }

    const farm = await prisma.farm.findFirst()
    if (!farm) {
      return NextResponse.json({ error: 'Farm not found' }, { status: 404 })
    }

    // Zapisz konfigurację
    if (config) {
      await prisma.settings.upsert({
        where: { farmId: farm.id },
        update: {
          maxWorkers: config.availableWorkers,
          avgEfficiency: config.averageEfficiency,
          hoursPerDay: config.hoursPerDay,
        },
        create: {
          farmId: farm.id,
          maxWorkers: config.availableWorkers || 80,
          avgEfficiency: config.averageEfficiency || 8,
          hoursPerDay: config.hoursPerDay || 8,
        }
      })
    }

    // Zapisz pracowników
    if (workers) {
      // Usuń starych pracowników
      await prisma.worker.deleteMany({
        where: { farmId: farm.id }
      })

      // Dodaj nowych
      await prisma.worker.createMany({
        data: workers.map((w: WorkerInput) => ({
          name: w.name,
          efficiency: w.efficiency || 8,
          isActive: w.status === 'active',
          farmId: farm.id,
        }))
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving workers:', error)
    return NextResponse.json({ error: 'Failed to save workers' }, { status: 500 })
  }
}
