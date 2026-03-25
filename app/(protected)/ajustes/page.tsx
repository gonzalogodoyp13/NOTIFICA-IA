import {
  ArrowLeft,
  BookOpenText,
  Building2,
  FileStack,
  Landmark,
  MapPinned,
  Printer,
  Scale,
  ScrollText,
  UserRoundCog,
  UsersRound,
} from 'lucide-react'
import { getSession } from '@/lib/auth-server'
import Topbar from '@/components/Topbar'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const configAreas = [
  {
    id: 'materias',
    title: 'Gestionar Materias',
    description: 'Configurar materias legales.',
    icon: BookOpenText,
  },
  {
    id: 'abogados',
    title: 'Gestionar Abogados',
    description: 'Administrar abogados asociados.',
    icon: UsersRound,
  },
  {
    id: 'tribunales',
    title: 'Gestionar Tribunales',
    description: 'Gestionar tribunales del sistema.',
    icon: Scale,
  },
  {
    id: 'diligencias',
    title: 'Gestionar Diligencias',
    description: 'Configurar tipos de diligencias.',
    icon: FileStack,
  },
  {
    id: 'comunas',
    title: 'Gestionar Comunas',
    description: 'Administrar comunas disponibles.',
    icon: MapPinned,
  },
  {
    id: 'bancos',
    title: 'Gestionar Bancos',
    description: 'Configurar bancos del sistema.',
    icon: Building2,
  },
  {
    id: 'procuradores',
    title: 'Gestionar Procuradores',
    description: 'Administrar procuradores y sus vinculaciones.',
    icon: UserRoundCog,
  },
  {
    id: 'estampos',
    title: 'Gestionar Estampos',
    description: 'Configurar plantillas y estampos del proceso.',
    icon: Printer,
  },
  {
    id: 'logs',
    title: 'Registros de Auditoria',
    description: 'Ver historial de cambios del sistema.',
    icon: ScrollText,
  },
]

export default async function AjustesPage() {
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
            <div className="page-kicker">Administracion</div>
            <h1 className="page-title">Ajustes de Oficina</h1>
            <p className="page-copy">
              Configura parametros y datos maestros con una presentacion mas clara para
              tareas administrativas recurrentes.
            </p>
          </div>

          <div className="app-panel-muted flex min-w-[260px] items-start gap-3 px-4 py-4">
            <Landmark className="mt-0.5 h-5 w-5 text-blue-700" />
            <p className="text-sm leading-6 text-slate-600">
              El contenido y la navegacion se mantienen intactos; esta capa mejora solo la
              apariencia y la legibilidad del modulo de configuracion.
            </p>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {configAreas.map((area, index) => {
            const Icon = area.icon
            const tones = [
              'from-blue-700 to-blue-500',
              'from-slate-900 to-slate-700',
              'from-emerald-700 to-emerald-500',
              'from-amber-700 to-amber-500',
            ]

            return (
              <Link
                key={area.id}
                href={`/ajustes/${area.id}`}
                className="interactive-card app-section group relative overflow-hidden p-6"
              >
                <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${tones[index % tones.length]}`} />
                <div className="flex items-start justify-between gap-4">
                  <div className={`rounded-2xl bg-gradient-to-br ${tones[index % tones.length]} p-3 text-white shadow-lg`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Ajuste
                  </span>
                </div>
                <h3 className="mt-8 text-xl font-semibold tracking-tight text-slate-950">
                  {area.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{area.description}</p>
              </Link>
            )
          })}
        </section>

        <div className="mt-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al Dashboard
          </Link>
        </div>
      </main>
    </div>
  )
}
