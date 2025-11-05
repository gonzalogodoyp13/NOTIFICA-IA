// Authentication utilities - Re-exports for convenience
// Server functions are in auth-server.ts, client functions in auth-client.ts
// This file maintains backward compatibility but delegates to the appropriate module

// Re-export server functions (for Server Components and API routes)
export { getSession, requireSession, getCurrentUser } from './auth-server'

// Re-export client functions (for Client Components)
export { signIn, signOut } from './auth-client'



