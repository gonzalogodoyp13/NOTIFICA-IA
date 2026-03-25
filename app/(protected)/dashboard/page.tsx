import { BriefcaseBusiness, ChevronRight, FilePlus2, FolderOpen, Receipt, Settings2 } from 'lucide-react'
import { getSession } from '@/lib/auth-server'
import Topbar from '@/components/Topbar'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const dashboardActions = [
  {
    id: 'agregar-demanda',
    title: 'Agregar Demanda',
    description: 'Registra una nueva demanda en el sistema.',
    href: '/demandas/nueva',
    icon: FilePlus2,
    tone: 'from-blue-700 to-blue-500',
  },
  {
    id: 'gestionar-demandas',
    title: 'Gestionar Demandas',
    description: 'Visualiza y administra todas tus demandas.',
    href: '/roles',
    icon: FolderOpen,
    tone: 'from-slate-900 to-slate-700',
  },
  {
    id: 'gestion-recibos',
    title: 'Gestion de Recibos',
    description: 'Consulta recibos generados y exporta resultados.',
    href: '/recibos',
    icon: Receipt,
    tone: 'from-emerald-700 to-emerald-500',
  },
  {
    id: 'ajustes-oficina',
    title: 'Ajustes de Oficina',
    description: 'Configura los parametros de tu oficina.',
    href: '/ajustes',
    icon: Settings2,
    tone: 'from-amber-700 to-amber-500',
  },
]

export default async function DashboardPage() {
  const session = await getSession()

  if (!session) {
    return null
  }

  return (
    <div className="app-shell">
      <Topbar />

      <main className="page-frame page-stack">
        <section className="page-header">
          <div>
            <div className="page-kicker">Panel operativo</div>
            <h1 className="page-title">Panel de Control</h1>
            <p className="page-copy">
              Bienvenido, {session.email}. Accede rapidamente a las tareas principales de
              NOTIFICA IA desde un entorno claro y profesional.
            </p>
          </div>

          <div className="grid min-w-[260px] gap-3 sm:grid-cols-2">
            <div className="app-panel-muted px-4 py-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Jornada
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-950">4</div>
              <div className="mt-1 text-sm text-slate-600">accesos operativos principales</div>
            </div>
            <div className="app-panel-muted px-4 py-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <BriefcaseBusiness className="h-4 w-4 text-blue-700" />
                Oficina activa
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-600">
                Gestiona casos, recibos y configuracion sin salir del flujo actual.
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          {dashboardActions.map((action) => {
            const Icon = action.icon
            return (
              <Link
                key={action.id}
                href={action.href}
                className="interactive-card app-section group relative overflow-hidden p-6"
              >
                <div
                  className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${action.tone}`}
                />
                <div className="flex items-start justify-between gap-4">
                  <div className={`rounded-2xl bg-gradient-to-br ${action.tone} p-3 text-white shadow-lg`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-300 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-slate-500" />
                </div>
                <h3 className="mt-8 text-xl font-semibold tracking-tight text-slate-950">
                  {action.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{action.description}</p>
              </Link>
            )
          })}
        </section>
      </main>
    </div>
  )
}
