import 'server-only'

import { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { recordActivityEvent } from '@/lib/audit/activityEvent'
import { debugLog, toSafeErrorMessage } from '@/lib/debugLog'

export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'DATABASE_ERROR'
  | 'INTERNAL_ERROR'

export type ApiSuccess<T> = { ok: true; data: T }
export type ApiFailure = {
  ok: false
  error: {
    code: ApiErrorCode
    message: string
    fields?: Record<string, string[]>
  }
}

export type ApiUser = NonNullable<Awaited<ReturnType<typeof getCurrentUserWithOffice>>>

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly status: number,
    public readonly fields?: Record<string, string[]>
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

function moduleForOperation(operation: string) {
  if (/send|mail|email|dispatch|reply/i.test(operation)) return 'emails'
  if (/receipt|recibo/i.test(operation)) return 'recibos'
  if (/search/i.test(operation)) return 'search'
  if (/document|pdf/i.test(operation)) return 'documents'
  return 'security'
}

export async function handleApiError(
  error: unknown,
  context: { operation: string; request?: NextRequest; user?: ApiUser | null }
) {
  const known = error instanceof ApiError ? error : translatePrismaError(error)
  if (known) {
    if (context.user && known.code !== 'UNAUTHORIZED') {
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

export async function requireApiUser(): Promise<ApiUser> {
  const user = await getCurrentUserWithOffice()
  if (!user) throw new ApiError('UNAUTHORIZED', 'No autorizado', 401)
  return user
}

export async function withApiUser(
  request: NextRequest,
  operation: string,
  handler: (user: ApiUser) => Promise<Response>
) {
  let user: ApiUser | null = null
  try {
    user = await requireApiUser()
    return await handler(user)
  } catch (error) {
    return await handleApiError(error, { operation, request, user })
  }
}
