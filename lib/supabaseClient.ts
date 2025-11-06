// Client-side Supabase client initialization
// This creates a browser client instance that uses cookies for session persistence
// Uses environment variables for URL and anonymous key (safe for client-side use)
import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env file.'
  )
}

// Create and export the browser Supabase client
// This client uses cookies for session persistence (works with middleware)
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)


