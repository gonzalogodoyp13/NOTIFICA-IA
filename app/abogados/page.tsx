import Link from 'next/link'
import { CircleCheck, Clock3, CreditCard, House, Plus, Timer } from 'lucide-react'
import { redirect } from 'next/navigation'
import { getAbogadoAccount } from '@/lib/auth/abogadoAccount'
import { contarCausasInicio } from '@/lib/encargos/listados'
import RecorridoPortal from './RecorridoPortal'
import { abogadoShortcuts } from './sections'

const statuses = [
  { label: 'Esperando respuesta', icon: Clock3, tone: 'bg-slate-100 text-slate-700' },
  { label: 'Por pagar', icon: CreditCard, tone: 'bg-amber-50 text-amber-800' },
  { label: 'En curso', icon: Timer, tone: 'bg-blue-50 text-blue-800' },
  { label: 'Finalizado', icon: CircleCheck, tone: 'bg-emerald-50 text-emerald-800' },
]

export default async function AbogadoHome({ searchParams }: { searchParams: Promise<{ recorrido?: string }> }) {
  const [account, { recorrido }] = await Promise.all([getAbogadoAccount(), searchParams])
  if (!account) redirect('/login')
  const cantidades = await contarCausasInicio(account.authUserId)

  const today = new Intl.DateTimeFormat('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Santiago',
  }).format(new Date())

  return (
    <>
      {recorrido === '1' && <RecorridoPortal />}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-4">
          <span className="app-panel flex size-11 shrink-0 items-center justify-center rounded-2xl text-blue-800 sm:size-[3.25rem]">
            <House className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="page-title break-words">Hola, {account.contacto.nombre}</h1>
            <p className="mt-1 text-sm text-slate-600 first-letter:uppercase">{today}</p>
          </div>
        </div>
        <Link href="/abogados/nuevo-encargo" className="inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
          <Plus className="size-4" aria-hidden="true" />Nuevo encargo
        </Link>
      </header>

      <section className="mt-6" aria-label="Estado de encargos">
        <dl className="app-panel grid grid-cols-2 divide-slate-200 overflow-hidden lg:grid-cols-4 lg:divide-x">
          {statuses.map(({ label, icon: Icon, tone }, index) => (
            <div key={label} className={`min-w-0 p-3.5 sm:p-5 ${index >= 2 ? 'border-t border-slate-200 lg:border-t-0' : ''} ${index % 2 ? 'border-l border-slate-200 lg:border-l-0' : ''}`}>
              <dt className="flex min-h-10 items-center gap-2 text-sm font-bold leading-snug text-slate-800">
                <span className={`hidden size-8 shrink-0 items-center justify-center rounded-xl min-[380px]:inline-flex ${tone}`}>
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                {label}
              </dt>
              <dd className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-slate-950">{cantidades[index]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-6" aria-labelledby="abogado-shortcuts-title">
        <h2 id="abogado-shortcuts-title" className="mb-3 text-base font-bold tracking-tight text-slate-900">Accesos rápidos</h2>
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {abogadoShortcuts.map(({ slug, label, icon: Icon }) => (
            <li key={slug}>
              <Link href={`/abogados/${slug}`} className="app-panel flex h-full min-h-24 flex-col items-center justify-center gap-2 px-2 py-3 text-center text-sm font-bold text-slate-900 hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                <span className="flex size-9 items-center justify-center rounded-xl bg-blue-50 text-blue-800">
                  <Icon className="size-[18px]" aria-hidden="true" />
                </span>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
