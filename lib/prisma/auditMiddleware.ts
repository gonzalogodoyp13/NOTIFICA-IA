// Prisma Audit Middleware
// Automatically logs all create/update/delete operations to audit_logs table
import { PrismaClient } from '@prisma/client'
import { getCurrentUserWithOffice } from '../auth-server'

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

    // Protection 2: Skip logging for AuditLog model to prevent self-logging recursion
    if (params.model === 'AuditLog') {
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
            diff: {
              input: params.args,
              result: result,
            },
          },
        })
      } catch (error) {
        // All logging failures are safely swallowed
        // This ensures audit middleware NEVER blocks API responses
        console.error('[Audit Middleware] Log skipped:', error instanceof Error ? error.message : String(error))
      }
    }

    // Always return the original query result, even if logging failed
    return result
  })
}
