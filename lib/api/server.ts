import 'server-only'

import { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { AuthResolutionError, resolveAuthenticatedUser, type AuthUser } from '@/lib/auth-server'
import { recordActivityEvent, recordBestEffortEvent } from '@/lib/audit/activityEvent'
import { requestEventWasRecorded, runWithAuditRequestState } from '@/lib/audit/requestState'
import { debugLog, toSafeErrorMessage } from '@/lib/debugLog'
import { createServerSupabaseClient } from '@/lib/supabaseServer'

export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'USER_NOT_PROVISIONED'
  | 'ACCOUNT_DISABLED'
  | 'FORBIDDEN'
  | 'SERVICE_UNAVAILABLE'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RECEIPT_EXISTS'
  | 'RECEIPT_GENERATION_IN_PROGRESS'
  | 'RECEIPT_CORRECTION_REQUIRED'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'RECEIPT_GENERATION_FAILED'
  | 'DATABASE_ERROR'
  | 'INTERNAL_ERROR'

export type ApiSuccess<T> = { ok: true; data: T }
export type ApiFailure = {
  ok: false
  error: {
    code: ApiErrorCode
    message: string
    fields?: Record<string, string[]>
    details?: Record<string, unknown>
  }
}

export type ApiUser = AuthUser
export type RequestContext = ApiUser & {
  user: ApiUser
  requestId: string
  actorType: 'USER'
  source: 'WEB'
}

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly status: number,
    public readonly fields?: Record<string, string[]>,
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json<ApiSuccess<T>>({ ok: true, data }, { status })
}

export function apiFailure(error: ApiError) {
  return NextResponse.json<ApiFailure>(
    {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
          ...(error.fields ? { fields: error.fields } : {}),
          ...(error.details ? { details: error.details } : {}),
      },
    },
    { status: error.status }
  )
}

function zodFields(error: z.ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_root'
    fields[key] = [...(fields[key] ?? []), issue.message]
  }
  return fields
}

export function parseApiInput<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, input: unknown): T {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'Revisa los datos ingresados',
      400,
      zodFields(parsed.error)
    )
  }
  return parsed.data
}

function translatePrismaError(error: unknown): ApiError | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null

  if (error.code === 'P2001' || error.code === 'P2025') {
    return new ApiError('NOT_FOUND', 'El registro solicitado no existe', 404)
  }
  if (error.code === 'P2002') {
    return new ApiError('CONFLICT', 'Ya existe un registro con esos datos', 409)
  }
  if (error.code === 'P2003') {
    return new ApiError('CONFLICT', 'El registro está relacionado con otros datos', 409)
  }
  return new ApiError('DATABASE_ERROR', 'No se pudo completar la operación', 500)
}

function translateAuthError(error: unknown): ApiError | null {
  if (!(error instanceof AuthResolutionError)) return null
  return new ApiError(error.code, error.message, error.status)
}

function moduleForOperation(operation: string) {
  if (/send|mail|email|dispatch|reply/i.test(operation)) return 'emails'
  if (/receipt|recibo/i.test(operation)) return 'recibos'
  if (/search/i.test(operation)) return 'search'
  if (/document|pdf/i.test(operation)) return 'documents'
  if (/notification|notificacion/i.test(operation)) return 'notificaciones'
  if (/diligenc/i.test(operation)) return 'diligencias'
  if (/role|rol|demand|ejecutad/i.test(operation)) return 'roles'
  if (/setting|ajuste|arancel|banco|abogado|procurador|comuna|materia|tribunal|estampo/i.test(operation)) return 'settings'
  if (/report/i.test(operation)) return 'reports'
  return 'security'
}

export async function handleApiError(
  error: unknown,
  context: { operation: string; request?: NextRequest; user?: ApiUser | null }
) {
  const known = error instanceof ApiError ? error : translateAuthError(error) ?? translatePrismaError(error)
  if (known) {
    if (context.user && known.code !== 'UNAUTHORIZED' && !requestEventWasRecorded()) {
      await recordActivityEvent({
        userId: context.user.id,
        officeId: context.user.officeId,
        eventType: 'api.failure',
        module: moduleForOperation(context.operation),
        result: known.status === 403 ? 'denied' : 'failure',
        description: 'Operacion fallida.',
        metadata: {
          operation: context.operation,
          errorCode: known.code,
          status: known.status,
          path: context.request?.nextUrl.pathname,
        },
      })
    }
    return apiFailure(known)
  }

  debugLog(`[API] ${context.operation} failed`, {
    error: toSafeErrorMessage(error),
    method: context.request?.method,
    path: context.request?.nextUrl.pathname,
    userId: context.user?.id,
    officeId: context.user?.officeId,
    operation: context.operation,
  })
  return apiFailure(new ApiError('INTERNAL_ERROR', 'Ocurrió un error inesperado', 500))
}

function requestIdFor(request?: NextRequest) {
  const value = request?.headers.get('x-request-id')?.trim()
  return value && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : crypto.randomUUID()
}

export async function requireApiUser(request?: NextRequest): Promise<RequestContext> {
  const user = await resolveAuthenticatedUser()
  return {
    ...user,
    user,
    requestId: requestIdFor(request),
    actorType: 'USER',
    source: 'WEB',
  }
}

export async function withApiUser(
  request: NextRequest,
  operation: string,
  handler: (context: RequestContext) => Promise<Response>
) {
  let user: RequestContext | null = null
  try {
    user = await requireApiUser(request)
    const response = await runWithAuditRequestState(async () => {
      const result = await handler(user!)
      const isReadLikeOperation = /(?:^|[. ])(?:preview|lookup)(?:$|[. ])/i.test(operation)
      const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method)
      if (!requestEventWasRecorded() && ((!isReadLikeOperation && isMutation) || result.status === 403)) {
        await recordBestEffortEvent(user!, {
          eventType: operation,
          module: moduleForOperation(operation),
          result: result.ok ? 'success' : result.status === 401 || result.status === 403 ? 'denied' : 'failure',
          description: result.ok ? 'Accion de negocio registrada.' : 'Accion de negocio fallida.',
          metadata: {
            operation,
            method: request.method,
            path: request.nextUrl.pathname,
            status: result.status,
          },
        })
      }
      return result
    })
    response.headers.set('x-request-id', user.requestId)
    return response
  } catch (error) {
    if (error instanceof AuthResolutionError && error.code === 'ACCOUNT_DISABLED') {
      if (error.user) {
        await recordBestEffortEvent({ ...error.user, requestId: requestIdFor(request) }, {
          eventType: 'security.access_denied', module: 'security', result: 'denied',
          recordType: 'user', recordId: error.user.id,
          description: 'Acceso denegado a una cuenta desactivada.',
          metadata: { errorCode: error.code, path: request.nextUrl.pathname },
        })
      }
      await createServerSupabaseClient().auth.signOut({ scope: 'local' }).catch(() => undefined)
    }
    const response = await handleApiError(error, { operation, request, user })
    response.headers.set('x-request-id', user?.requestId ?? requestIdFor(request))
    return response
  }
}
