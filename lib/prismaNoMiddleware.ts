// Prisma Client WITHOUT middleware (for authentication queries)
// This client is used to break the recursion loop between audit middleware and getCurrentUserWithOffice()
// It does NOT have query logging or audit middleware registered
import { PrismaClient } from '@prisma/client'

// Global variable to store Prisma instance without middleware
const globalForPrismaNoMiddleware = globalThis as unknown as {
  prismaNoMiddleware: PrismaClient | undefined
}

// Create or reuse existing Prisma Client WITHOUT any middleware
// In development: reuse instance to avoid too many connections
// In production: create new instance
export const prismaNoMiddleware = globalForPrismaNoMiddleware.prismaNoMiddleware ?? new PrismaClient()

// Mark this client to skip audit logging
// This flag is checked by the audit middleware to prevent recursion
;(prismaNoMiddleware as any).__noAudit = true

// In development, save instance to global variable
if (process.env.NODE_ENV !== 'production') {
  globalForPrismaNoMiddleware.prismaNoMiddleware = prismaNoMiddleware
}




