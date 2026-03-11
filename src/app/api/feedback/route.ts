import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as Record<string, unknown>).role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Brak uprawnień" }, { status: 403 })
  }
  const feedback = await prisma.feedback.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json({ feedback })
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const body = await request.json()
    const fb = await prisma.feedback.create({
      data: {
        message: body.message,
        category: body.category || 'general',
        page: body.page || null,
        userName: (session?.user as Record<string, unknown>)?.name as string || 'Anonim',
        userEmail: (session?.user as Record<string, unknown>)?.email as string || null,
        tenantName: (session?.user as Record<string, unknown>)?.tenantName as string || null,
      }
    })
    return NextResponse.json({ feedback: fb })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
