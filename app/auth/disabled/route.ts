import { NextResponse } from 'next/server'

import { createServerSupabaseClient } from '@/lib/supabaseServer'

export async function GET(request: Request) {
  const supabase = createServerSupabaseClient()
  await supabase.auth.signOut().catch(() => undefined)
  return NextResponse.redirect(new URL('/login?error=account_disabled', request.url))
}
