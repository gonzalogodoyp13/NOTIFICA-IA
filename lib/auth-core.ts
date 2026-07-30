export type AuthUser = {
  id: string
  authUserId: string
  email: string
  officeId: number
  officeName: string
  isOfficeAdmin: boolean
}

export type AuthFailureCode =
  | 'UNAUTHORIZED'
  | 'USER_NOT_PROVISIONED'
  | 'ACCOUNT_DISABLED'
  | 'SERVICE_UNAVAILABLE'

export class AuthResolutionError extends Error {
  constructor(
    public readonly code: AuthFailureCode,
    message: string,
    public readonly status: 401 | 403 | 503,
    options?: { cause?: unknown; user?: AuthUser }
  ) {
    super(message, options)
    this.name = 'AuthResolutionError'
    this.user = options?.user
  }

  readonly user?: AuthUser
}

type LocalUser = AuthUser & { isActive: boolean }

export async function resolveCanonicalUser(dependencies: {
  getAuthUser: () => Promise<{ user: { id: string } | null; error?: unknown }>
  findUserByAuthUserId: (authUserId: string) => Promise<LocalUser | null>
}): Promise<AuthUser> {
  let authUser: { id: string }
  try {
    const result = await dependencies.getAuthUser()
    if (result.error || !result.user) {
      throw new AuthResolutionError('UNAUTHORIZED', 'No autorizado', 401, { cause: result.error })
    }
    authUser = result.user
  } catch (error) {
    if (error instanceof AuthResolutionError) throw error
    throw new AuthResolutionError('SERVICE_UNAVAILABLE', 'Servicio de autenticacion no disponible', 503, { cause: error })
  }

  let dbUser: LocalUser | null
  try {
    dbUser = await dependencies.findUserByAuthUserId(authUser.id)
  } catch (error) {
    throw new AuthResolutionError('SERVICE_UNAVAILABLE', 'Servicio de usuarios no disponible', 503, { cause: error })
  }
  if (!dbUser) throw new AuthResolutionError('USER_NOT_PROVISIONED', 'Usuario no provisionado', 403)
  if (!dbUser.isActive) {
    const { isActive: _isActive, ...disabledUser } = dbUser
    throw new AuthResolutionError('ACCOUNT_DISABLED', 'Cuenta desactivada', 403, { user: disabledUser })
  }
  const { isActive: _isActive, ...user } = dbUser
  return user
}
