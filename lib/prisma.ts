// Prisma Client singleton instance
// This prevents multiple instances in development (Next.js hot reload)
import { PrismaClient } from '@prisma/client'
import { registerAuditMiddleware } from './prisma/auditMiddleware'

// Global variable to store Prisma instance
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Create or reuse existing Prisma Client
// In development: reuse instance to avoid too many connections
// In production: create new instance
export const prisma = globalForPrisma.prisma ?? new PrismaClient()

// Register audit middleware if not already registered
// Check if middleware is already applied by checking for a custom property
if (!(prisma as any).__auditMiddlewareRegistered) {
  registerAuditMiddleware(prisma)
  ;(prisma as any).__auditMiddlewareRegistered = true
}

// In development, save instance to global variable
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

