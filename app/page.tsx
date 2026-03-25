import { ArrowRight, BriefcaseBusiness, Files, Landmark, ShieldCheck } from 'lucide-react'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth-server'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const highlights = [
  {
    title: 'Gestion centralizada',
    description: 'Consulta roles, diligencias y documentos desde una sola plataforma operativa.',
    icon: Files,
  },
  {
    title: 'Trabajo diario mas claro',
    description: 'Reduce busquedas manuales con vistas ordenadas para la oficina receptora.',
    icon: BriefcaseBusiness,
  },
  {
    title: 'Seguimiento confiable',
    description: 'Mantiene registro visual y administrativo de cada gestion en curso.',
    icon: ShieldCheck,
  },
]

export default async function Home() {
  const session = await getSession()

  if (session) {
    redirect('/dashboard')
  }

  return (
    <div className="app-shell">
      <section className="page-frame py-8 sm:py-12">
        <div className="soft-grid app-section relative overflow-hidden px-6 py-10 sm:px-10 sm:py-14">
          <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-blue-100/70 to-transparent" />
          <div className="relative grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-blue-800">
                <Landmark className="h-4 w-4" />
                Plataforma para oficinas receptoras
              </div>
              <h1 className="hero-title hero-display mt-6 text-balance">
                Una interfaz judicial mas sobria, clara y lista para el trabajo diario.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                NOTIFICA IA organiza el trabajo operativo del tribunal con una presentacion
                profesional, moderna y enfocada en rapidez visual para empleados de oficina.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-[0_20px_40px_-24px_rgba(15,23,42,0.85)] hover:bg-slate-800"
                >
                  Ingresar al sistema
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <div className="rounded-full border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-600 shadow-sm">
                  Operacion diaria enfocada en casos, diligencias, documentos y recibos.
                </div>
              </div>
            </div>

            <div className="app-panel relative overflow-hidden p-6 sm:p-8">
              <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900 opacity-95" />
              <div className="relative mt-10">
                <div className="rounded-[24px] border border-slate-200 bg-white/95 p-5 shadow-[var(--shadow-sm)]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Estado del sistema
                      </div>
                      <h2 className="mt-2 text-xl font-semibold text-slate-950">
                        Operacion estable
                      </h2>
                    </div>
                    <span className="status-pill border-emerald-200 bg-emerald-50 text-emerald-700">
                      Conectado
                    </span>
                  </div>

                  <div className="mt-6 space-y-3">
                    <StatusRow label="API principal" value="Disponible" tone="success" />
                    <StatusRow label="Base de datos" value="Configurar" tone="muted" />
                    <StatusRow label="Auditoria" value="Lista" tone="success" />
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {highlights.map(item => {
                    const Icon = item.icon
                    return (
                      <div key={item.title} className="app-panel-muted p-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
                          <Icon className="h-4 w-4" />
                        </div>
                        <h3 className="mt-4 text-sm font-semibold text-slate-900">{item.title}</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function StatusRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'success' | 'muted'
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      <span
        className={[
          'status-pill',
          tone === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-slate-200 bg-white text-slate-600',
        ].join(' ')}
      >
        {value}
      </span>
    </div>
  )
}
