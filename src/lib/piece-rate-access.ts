import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** Kalkulator wynagrodzeń jest dostępny dla zarządców i super-adminów. */
const ALLOWED_ROLES = ['MANAGER', 'SUPER_ADMIN']

export interface PieceRateContext {
  tenantId: string
  farmId: string
}

export class PieceRateAccessError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'PieceRateAccessError'
  }
}

/**
 * Zwraca tenant + farmę dla zalogowanego użytkownika albo rzuca błąd z kodem HTTP.
 * Farma NIE jest tworzona automatycznie — brak farmy to błąd konfiguracji,
 * a nie powód do zgadywania danych.
 */
export async function requirePieceRateContext(): Promise<PieceRateContext> {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    throw new PieceRateAccessError('Nie zalogowano', 401)
  }

  const user = session.user as Record<string, unknown>
  const role = String(user.role || '')
  if (!ALLOWED_ROLES.includes(role)) {
    throw new PieceRateAccessError('Brak uprawnień do kalkulatora wynagrodzeń', 403)
  }

  const tenantId = String(user.tenantId || '')
  if (!tenantId) {
    throw new PieceRateAccessError('Brak przypisanego tenanta', 401)
  }

  const farm = await prisma.farm.findFirst({ where: { tenantId }, select: { id: true } })
  if (!farm) {
    throw new PieceRateAccessError('Brak zdefiniowanej farmy — uzupełnij dane plantacji', 400)
  }

  return { tenantId, farmId: farm.id }
}
