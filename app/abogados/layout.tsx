import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Landmark, LogOut, Mail } from 'lucide-react'
import { getAbogadoAccount } from '@/lib/auth/abogadoAccount'
import { createServerSupabaseClient } from '@/lib/supabaseServer'
import SidebarNav from './SidebarNav'

export const metadata: Metadata = { title: 'Portal de abogados | NOTIFICA IA' }
export const dynamic = 'force-dynamic'

export default async function AbogadoLayout({ children }: { children: React.ReactNode }) {
  const account = await getAbogadoAccount()
  if (!account) redirect('/login')

  async function logout() {
    'use server'
    const supabase = await createServerSupabaseClient()
    await supabase.auth.signOut({ scope: 'local' })
    redirect('/login')
  }

  const nombreCompleto = account.contacto.nombre
  const initials = nombreCompleto.split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toLocaleUpperCase('es-CL')

  return (
    <div className="app-shell grid min-h-dvh lg:grid-cols-[14rem_minmax(0,1fr)]">
      <aside className="min-w-0 bg-slate-950 px-4 pb-3 pt-4 text-white lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:pb-5 lg:pt-5">
        <Link href="/abogados" className="inline-flex items-center gap-3 rounded-xl px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-950">
            <Landmark className="size-5" aria-hidden="true" />
          </span>
          <span className="text-base font-bold tracking-tight">NOTIFICA IA</span>
        </Link>

        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 lg:mt-6">
          <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-blue-700 text-xs font-bold text-white">{initials}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold" title={nombreCompleto}>{nombreCompleto}</p>
            <p className="text-xs text-blue-200">Abogado</p>
          </div>
        </div>
        <SidebarNav />
      </aside>

      <div className="min-w-0 bg-slate-50/80">
        <header className="flex min-h-16 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-slate-200 bg-white px-4 py-2.5 sm:px-6 lg:px-8">
          <span className="text-sm font-semibold text-slate-800">Portal de abogados</span>
          <div className="flex flex-wrap items-center gap-1 sm:gap-3">
            <a href="mailto:contacto@notificaia.cl" className="inline-flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
              <Mail className="hidden size-4 text-blue-700 sm:block" aria-hidden="true" />Soporte
            </a>
            <form action={logout}>
              <button type="submit" className="inline-flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                <LogOut className="hidden size-4 sm:block" aria-hidden="true" />Cerrar sesión
              </button>
            </form>
          </div>
        </header>
        <div className="mx-auto max-w-[106rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</div>
      </div>
    </div>
  )
}
