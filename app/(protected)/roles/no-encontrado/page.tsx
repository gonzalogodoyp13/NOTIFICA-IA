import Link from 'next/link'
import { ArrowRight, FileQuestion } from 'lucide-react'
import { redirect } from 'next/navigation'

export default function RolNoEncontradoPage({
  searchParams,
}: {
  searchParams?: { rol?: string }
}) {
  const rol = searchParams?.rol?.trim()
  if (!rol) redirect('/roles')

  return (
    <main className="app-shell flex min-h-[calc(100vh-4rem)] items-center justify-center px-6 py-16 text-slate-950">
      <section className="app-section w-full max-w-3xl px-8 py-12 text-center sm:px-14 sm:py-16">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-700 text-white shadow-[0_18px_36px_-20px_rgba(29,78,216,0.75)]">
          <FileQuestion aria-hidden="true" className="h-7 w-7" />
        </div>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.28em] text-blue-700">
          ROL no encontrado
        </p>
        <h1 className="mx-auto mt-4 max-w-2xl text-balance text-3xl font-semibold leading-tight text-slate-950 sm:text-4xl">
          No se registran causas con el rol {rol}.
        </h1>
        <div className="mx-auto mt-10 h-px max-w-md bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
        <Link
          href={`/demandas/nueva?rol=${encodeURIComponent(rol)}`}
          className="mt-10 inline-flex items-center gap-3 rounded-full bg-blue-700 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_18px_36px_-20px_rgba(29,78,216,0.75)] transition hover:-translate-y-0.5 hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-4 focus:ring-offset-white"
        >
          Crear causa con ROL {rol}
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </section>
    </main>
  )
}
