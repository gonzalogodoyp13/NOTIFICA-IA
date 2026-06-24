// Prisma Audit Middleware
// Automatically logs all create/update/delete operations to audit_logs table
import { PrismaClient } from '@prisma/client'
import { getCurrentUserWithOffice } from '../auth-server'
import { defaultActivityDescription, deletionSnapshot, editedFieldsMetadata } from '../audit/activityEventCore'
import { sanitizeAuditDiff } from '../auditSanitizer'
import { debugLog, toSafeErrorMessage } from '../debugLog'

function moduleForModel(model: string) {
  if (model === 'RolCausa' || model === 'Demanda') return 'roles'
  if (model === 'Diligencia') return 'diligencias'
  if (model === 'Notificacion') return 'notificaciones'
  if (model === 'Documento' || model === 'DocumentoVersion') return 'documents'
  if (model === 'Recibo' || model === 'ReceiptBulkOperation') return 'recibos'
  if (model.startsWith('RecibosDispatch')) return 'emails'
  if (['Abogado', 'Banco', 'Procurador', 'Arancel', 'Comuna', 'Materia', 'Tribunal', 'DiligenciaTipo', 'Estampo', 'EstampoCustom'].includes(model)) return 'settings'
  return 'security'
}

function actionEventType(model: string, action: string) {
  const verb = action === 'create' ? 'create' : action === 'delete' ? 'delete' : 'update'
  return `${moduleForModel(model)}.${verb}`
}

function shortNameFor(result: any) {
  return result?.nombre ?? result?.rol ?? result?.caratula ?? result?.numeroRecibo ?? result?.email ?? null
}

function recordIdFor(result: any, args: any) {
  return result?.id ?? args?.where?.id ?? null
}

function shouldEmitStructuredCrudEvent(model: string, action: string, args: any) {
  if (model === 'Diligencia' && action === 'update') {
    const fields = Object.keys(args?.data ?? {})
    if (fields.length > 0 && fields.every(field => field === 'estadoCobro' || field === 'fechaPago')) {
      return false
    }
  }

  return ![
    'AuditLog',
    'ActivityEvent',
    'Documento',
    'DocumentoVersion',
    'Recibo',
    'ReceiptBulkOperation',
    'RecibosDispatchBatch',
    'RecibosDispatchRecipient',
    'RecibosDispatchReply',
    'RecibosDispatchReplyAttachment',
    'RecibosDispatchItem',
    'RecibosReplySyncCheckpoint',
    'RecibosProviderHealth',
    'DocumentNumberSequence',
  ].includes(model)
}

function activityDescription(model: string, action: string, shortName: string | null, rol: string | null) {
  const label = model
  if (action === 'create') return `${label} creado${shortName ? `: ${shortName}` : ''}.`
  if (action === 'delete') return `${label} eliminado${shortName ? `: ${shortName}` : ''}.`
  return defaultActivityDescription({ eventType: `${moduleForModel(model)}.update`, result: 'success', shortName, rol })
}

/**
 * Registers audit middleware on Prisma Client instance
 * Intercepts all create/update/delete operations and logs them to audit_logs
 * This middleware NEVER blocks operations - all logging failures are safely swallowed
 */
export function registerAuditMiddleware(prisma: PrismaClient) {
  prisma.$use(async (params, next) => {
    // Execute the operation first - this must always succeed
    const result = await next(params)

    // Protection 1: Skip logging if this client is marked to skip audit (prevents recursion)
    if ((prisma as any).__noAudit === true) {
      return result
    }

    // Protection 2: Skip logging for audit models to prevent self-logging recursion
    if (params.model === 'AuditLog' || params.model === 'ActivityEvent') {
      return result
    }

    // Log only for mutation actions
    if (['create', 'update', 'delete'].includes(params.action)) {
      // Wrap entire logging block in try/catch to ensure it never blocks
      try {
        // Try to get current user session
        // This may fail in contexts without cookies (e.g., background jobs)
        const user = await getCurrentUserWithOffice()

        // Only log if we have valid user and officeId
        // Skip logging silently if user context is unavailable
        if (!user || !user.id || !user.officeId) {
          // Silently skip logging if user context is unavailable
          return result
        }

        // Determine readable table name with fallback
        const safeTabla = params.model ?? 'general'

        // Build log entry - all errors here are caught and swallowed
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            officeId: user.officeId,
            tabla: safeTabla,
            accion: params.action.toUpperCase(),
            diff: sanitizeAuditDiff({
              input: params.args,
              result: result,
            }) as any,
          },
        })

        const model = params.model ?? 'general'
        if (shouldEmitStructuredCrudEvent(model, params.action, params.args)) {
          const shortName = shortNameFor(result)
          const recordId = recordIdFor(result, params.args)
          const rol = typeof result?.rol === 'string' ? result.rol : null
          const fields = params.action === 'update' ? Object.keys(params.args?.data ?? {}) : []
          const metadata = params.action === 'delete'
            ? deletionSnapshot({ recordType: model, recordId: recordId ?? 'unknown', rol, shortName, userId: user.id })
            : params.action === 'update'
              ? editedFieldsMetadata(fields)
              : { created: true }

          await prisma.activityEvent.create({
            data: {
              userId: user.id,
              officeId: user.officeId,
              eventType: actionEventType(model, params.action),
              module: moduleForModel(model),
              result: 'success',
              recordType: model,
              recordId: recordId ? String(recordId) : null,
              rolId: typeof result?.rolId === 'string' ? result.rolId : null,
              rol,
              shortName,
              description: activityDescription(model, params.action, shortName, rol),
              metadata: metadata as any,
            },
          })
        }
      } catch (error) {
        // All logging failures are safely swallowed
        // This ensures audit middleware NEVER blocks API responses
        debugLog('[Audit Middleware] Log skipped', {
          error: toSafeErrorMessage(error),
        })
      }
    }

    // Always return the original query result, even if logging failed
    return result
  })
}
