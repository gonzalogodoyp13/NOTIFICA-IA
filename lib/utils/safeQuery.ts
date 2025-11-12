// Safe query helper for Prisma operations
// Wraps Prisma calls in try/catch and provides consistent error handling
export async function safeQuery<T>(
  fn: () => Promise<T>
): Promise<T | null> {
  try {
    return await fn()
  } catch (error) {
    console.error('[safeQuery] Error executing query:', error)
    return null
  }
}

