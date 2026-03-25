'use client'

import { AlertTriangle, KeyRound, Landmark, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from '@/lib/auth-client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const hasSupabaseKeys =
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn(email, password)

      if (result.success) {
        try {
          await fetch('/api/log', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action: 'login' }),
          })
        } catch (logError) {
          console.error('Error logging login event:', logError)
        }

        router.push('/dashboard')
        router.refresh()
      } else {
        setError(result.error || 'Error al iniciar sesion')
      }
    } catch {
      setError('Error inesperado. Por favor, intenta nuevamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-shell min-h-screen">
      <div className="page-frame py-10">
        <div className="grid min-h-[calc(100vh-8rem)] gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="soft-grid app-section relative hidden overflow-hidden p-10 lg:flex lg:flex-col lg:justify-between">
            <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-blue-100/80 to-transparent" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/85 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-600 shadow-sm">
                <Landmark className="h-4 w-4 text-blue-700" />
                Acceso seguro a la oficina
              </div>
              <h1 className="hero-title hero-display mt-6 max-w-xl text-balance">
                Gestion profesional para el trabajo judicial cotidiano.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-600">
                Accede al sistema para continuar con la gestion de roles, diligencias,
                documentos y recibos con una interfaz mas clara y confiable.
              </p>
            </div>

            <div className="relative grid gap-4 sm:grid-cols-2">
              <FeatureCard
                icon={ShieldCheck}
                title="Operacion confiable"
                description="Entorno preparado para tareas administrativas sensibles."
              />
              <FeatureCard
                icon={KeyRound}
                title="Ingreso controlado"
                description="Autenticacion centralizada para el personal autorizado."
              />
            </div>
          </section>

          <section className="app-section flex items-center justify-center px-4 py-8 sm:px-8">
            <div className="w-full max-w-md">
              <div className="mb-8">
                <div className="page-kicker">Acceso</div>
                <h2 className="page-title">Iniciar sesion</h2>
                <p className="page-copy">
                  Ingresa tus credenciales para continuar con tu jornada de trabajo.
                </p>
              </div>

              {!hasSupabaseKeys && (
                <div className="mb-5 rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900 shadow-sm">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                    <p>
                      Advertencia: las variables de entorno de Supabase no estan configuradas.
                      Define `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
                    </p>
                  </div>
                </div>
              )}

              <form className="app-panel p-6 sm:p-7" onSubmit={handleSubmit}>
                <div className="space-y-5">
                  <div>
                    <label htmlFor="email" className="field-label">
                      Correo electronico
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      className="flex h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="nombre@oficina.cl"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <label htmlFor="password" className="field-label">
                      Contrasena
                    </label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      className="flex h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="Ingresa tu contrasena"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                </div>

                {error && (
                  <div className="mt-5 rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !hasSupabaseKeys}
                  className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-blue-700 px-4 text-sm font-semibold text-white shadow-[0_18px_36px_-20px_rgba(29,78,216,0.75)] hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? 'Iniciando sesion...' : 'Ingresar'}
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof ShieldCheck
  title: string
  description: string
}) {
  return (
    <div className="app-panel p-5">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </div>
  )
}
