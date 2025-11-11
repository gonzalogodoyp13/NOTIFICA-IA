// Audit logging helper for Phase 4 ROL mutations
import { prisma } from "@/lib/prisma";

interface AuditParams {
  userEmail: string;
  userId?: string;
  officeId?: string | number;
  rolId?: string;
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
  rolId,
  tabla,
  accion,
  diff,
}: AuditParams) {
  try {
    const prefix = rolId ? `[ROL:${rolId}] ` : "";
    const actionMessage = diff
      ? `${prefix}${accion} en ${tabla}${diff ? ` (${JSON.stringify(diff)})` : ""}`
      : `${prefix}${accion} en ${tabla}`;

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

