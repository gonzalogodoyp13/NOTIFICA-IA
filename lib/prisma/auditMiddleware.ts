// Prisma Audit Middleware
// Automatically logs all create/update/delete operations to audit_logs table
import { PrismaClient } from '@prisma/client'
import { getCurrentUserWithOffice } from '../auth-server'

/**
 * Registers audit middleware on Prisma Client instance
 * Intercepts all create/update/delete operations and logs them to audit_logs
 */
export function registerAuditMiddleware(prisma: PrismaClient) {
  prisma.$use(async (params, next) => {
    // Execute the operation first
    const result = await next(params)

    // Log only for mutation actions
    if (['create', 'update', 'delete'].includes(params.action)) {
      try {
        // Try to get current user session
        // This may fail in contexts without cookies (e.g., background jobs)
        const user = await getCurrentUserWithOffice()

        const userId = user?.id ?? 'SYSTEM'
        const officeId = user?.officeId ?? 0

        // Create audit log entry
        await prisma.auditLog.create({
          data: {
            userId,
            officeId,
            tabla: params.model ?? 'Unknown',
            accion: params.action.toUpperCase(),
            diff: {
              input: params.args,
              result: result,
            },
          },
        })
      } catch (err) {
        // Log error but don't break the main operation
        // This ensures audit failures don't affect business logic
        console.error('[Audit Middleware] Error logging operation:', err)
      }
    }

    return result
  })
}

