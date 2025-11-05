// Supabase client initialization
// This creates a singleton Supabase client instance for use throughout the app
// Uses environment variables for URL and anonymous key (safe for client-side use)
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env file.'
  )
}

// Create and export the Supabase client
// This client communicates with Supabase via HTTPS API (IPv4 safe, no direct DB connection)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)


