import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabaseServer'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  if (code) {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) redirect('/abogados')
  }
  redirect('/login?error=abogado_confirmation')
}
