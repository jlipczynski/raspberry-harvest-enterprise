import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant'
import { getAuthUrl } from '@/lib/google-drive'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const tenantId = await requireTenantId()
    const url = getAuthUrl(tenantId)
    return NextResponse.redirect(url)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
