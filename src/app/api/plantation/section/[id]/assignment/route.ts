import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const assignments = await prisma.sectionTemplateAssignment.findMany({
      where: { sectionId: id },
      include: {
        template: { select: { id: true, name: true, varietyId: true, productionYear: true, weeklyCurveSummer: true, dailyCurveSummer: true, startWeekSummer: true, totalKgSummer: true, weeklyCurveAutumn: true, dailyCurveAutumn: true, startWeekAutumn: true, totalKgAutumn: true, winteredInTunnel: true, plantSource: true, productionCycle: true } },
        harvestCurve: { select: { id: true, year: true, season: true, curve: true, totalKg: true, startWeek: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ assignments })
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const data: Record<string, unknown> = {
      section: { connect: { id } },
      template: { connect: { id: body.templateId } },
      targetYear: body.targetYear || new Date().getFullYear(),
      season: body.season || 'summer',
      adjustmentPercent: body.adjustmentPercent || 0,
      adjustedCurve: body.adjustedCurve || [],
      isActive: body.isActive !== false,
      plantingDate: body.plantingDate || null,
    }
    if (body.harvestCurveId) data.harvestCurve = { connect: { id: body.harvestCurveId } }
    // Deaktywuj poprzednie przypisania dla tej sekcji+season+year
    await prisma.sectionTemplateAssignment.updateMany({
      where: {
        sectionId: id,
        season: body.season || 'summer',
        targetYear: body.targetYear || new Date().getFullYear(),
        isActive: true,
        NOT: {
          templateId: body.templateId,
        }
      },
      data: { isActive: false }
    })
    const assignment = await prisma.sectionTemplateAssignment.upsert({
      where: {
        sectionId_templateId_targetYear_season: {
          sectionId: id,
          templateId: body.templateId,
          targetYear: body.targetYear || new Date().getFullYear(),
          season: body.season || 'summer',
        },
      },
      create: data as Parameters<typeof prisma.sectionTemplateAssignment.create>[0]['data'],
      update: {
        adjustmentPercent: body.adjustmentPercent || 0,
        adjustedCurve: body.adjustedCurve || [],
        isActive: body.isActive !== false,
        harvestCurve: body.harvestCurveId ? { connect: { id: body.harvestCurveId } } : body.harvestCurveId === null ? { disconnect: true } : undefined,
      },
      include: {
        template: { select: { id: true, name: true, weeklyCurveSummer: true, dailyCurveSummer: true, startWeekSummer: true, weeklyCurveAutumn: true, dailyCurveAutumn: true, startWeekAutumn: true } },
      },
    })
    return NextResponse.json({ assignment })
  } catch (error) {
    console.error('Error saving assignment:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const assignmentId = searchParams.get('assignmentId')
    if (assignmentId) {
      await prisma.sectionTemplateAssignment.delete({ where: { id: assignmentId } })
    } else {
      await prisma.sectionTemplateAssignment.deleteMany({ where: { sectionId: id } })
    }
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
