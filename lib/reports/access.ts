import type { AuthUser } from '@/lib/auth-server'
import { ApiError } from '@/lib/api/server'

export function canAccessReports(user: Pick<AuthUser, 'isOfficeAdmin'> | null | undefined) {
  // resolveAuthenticatedUser already rejects inactive accounts before returning AuthUser.
  return !!user?.isOfficeAdmin
}

export function assertReportAdmin(user: Pick<AuthUser, 'isOfficeAdmin'>) {
  if (!canAccessReports(user)) {
    throw new ApiError('FORBIDDEN', 'Solo administradores activos de la oficina pueden acceder a reportes.', 403)
  }
}
