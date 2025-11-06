// Browser-side Supabase client for Next.js 14 App Router
// This client uses SSR-compatible cookie handling for authentication persistence
// This file can only be imported in Client Components
'use client'

import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env file.'
  )
}

// Create and export the Supabase client for browser use
// Uses createBrowserClient from @supabase/ssr to handle cookies correctly
// This ensures authentication state persists across page refreshes
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)
