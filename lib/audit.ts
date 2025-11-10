// Audit logging helper for Phase 4 ROL mutations
import { prisma } from "@/lib/prisma";

interface AuditParams {
  userEmail: string;
  userId?: string;
  officeId?: string | number;
  tabla: string;
  accion: string;
  diff?: Record<string, any>;
}

/**
 * Log an audit entry for ROL mutations
 * Uses the existing AuditLog schema (userEmail, action)
 */
export async function logAudit({
  userEmail,
  userId,
  officeId,
  tabla,
  accion,
  diff,
}: AuditParams) {
  try {
    const actionMessage = diff
      ? `${accion} en ${tabla}${diff ? ` (${JSON.stringify(diff)})` : ""}`
      : `${accion} en ${tabla}`;

    await prisma.auditLog.create({
      data: {
        userEmail,
        action: actionMessage,
      },
    });
  } catch (error) {
    console.error("Error logging audit:", error);
    // Don't throw - audit logging failures shouldn't break the main operation
  }
}

