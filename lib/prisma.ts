// Prisma Client singleton instance
// This prevents multiple instances in development (Next.js hot reload)
import { PrismaClient } from '@prisma/client'

// Global variable to store Prisma instance
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Create or reuse existing Prisma Client
// In development: reuse instance to avoid too many connections
// In production: create new instance
export const prisma = globalForPrisma.prisma ?? new PrismaClient()

// In development, save instance to global variable
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

