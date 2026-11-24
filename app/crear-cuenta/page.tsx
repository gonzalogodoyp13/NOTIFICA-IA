import type { Metadata } from 'next'
import Link from 'next/link'
import { BriefcaseBusiness } from 'lucide-react'
import { abogadoTerms } from '@/lib/auth/abogadoAccount'
import RegistrationForm from './RegistrationForm'

export const metadata: Metadata = { title: 'Crear cuenta | NOTIFICA IA' }
export const dynamic = 'force-dynamic'

export default function RegistrationPage() {
  return (
    <div className="app-shell">
      <div className="page-frame py-6 sm:py-10">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
          <aside className="relative hidden overflow-hidden rounded-[28px] bg-slate-950 p-10 text-white lg:flex lg:flex-col lg:justify-start">
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-blue-900/65 via-transparent to-sky-800/30" />
            <div className="relative mt-10">
              <span className="inline-flex rounded-2xl border border-white/20 bg-white/10 p-3 text-blue-100">
                <BriefcaseBusiness className="size-6" aria-hidden="true" />
              </span>
              <p className="hero-display mt-5 max-w-xs text-4xl font-semibold leading-tight">Tu espacio para gestionar diligencias</p>
              <p className="mt-4 max-w-xs leading-relaxed text-slate-300">Accede al portal de abogados o solicita una consulta para tu oficina receptora.</p>
            </div>
          </aside>
          <section className="app-section p-5 sm:p-8 lg:p-10" aria-labelledby="registration-title">
            <h1 id="registration-title" className="page-title">Crear cuenta</h1>
            <RegistrationForm terms={abogadoTerms()} />
            <p className="mt-7 border-t border-slate-200 pt-5 text-sm text-slate-600">
              ¿Ya tienes una cuenta?{' '}
              <Link className="font-semibold text-blue-800 underline underline-offset-4" href="/login">Iniciar sesión</Link>
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
