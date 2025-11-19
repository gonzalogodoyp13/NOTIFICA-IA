import { createServerSupabaseClient } from './supabaseServer'
import { redirect } from 'next/navigation'

export async function signIn(email: string, password: string) {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function getSession(): Promise<{ email: string } | null> {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user?.email) return null
  return { email: data.user.email }
}

export async function requireSession(): Promise<{ email: string }> {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
}

export async function signOut() {
  const supabase = createServerSupabaseClient()
  await supabase.auth.signOut()
}
