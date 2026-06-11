import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createOAuth2Client } from '@/lib/google-drive'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const tenantId = searchParams.get('state')

  if (!code || !tenantId) {
    return NextResponse.redirect(new URL('/dashboard/settings?gdrive=error', request.url))
  }

  try {
    const client = createOAuth2Client()
    const { tokens } = await client.getToken(code)

    if (!tokens.refresh_token) {
      return NextResponse.redirect(new URL('/dashboard/settings?gdrive=no_refresh', request.url))
    }

    // Store refresh token on the farm
    const farm = await prisma.farm.findFirst({ where: { tenantId } })
    if (!farm) {
      return NextResponse.redirect(new URL('/dashboard/settings?gdrive=no_farm', request.url))
    }

    await prisma.farm.update({
      where: { id: farm.id },
      data: { googleDriveRefreshToken: tokens.refresh_token },
    })

    return NextResponse.redirect(new URL('/dashboard/settings?gdrive=success', request.url))
  } catch (error) {
    console.error('Google Drive OAuth callback error:', error)
    return NextResponse.redirect(new URL('/dashboard/settings?gdrive=error', request.url))
  }
}
