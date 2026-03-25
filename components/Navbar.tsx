// Navbar component for NOTIFICA IA
// Simple navigation bar with the app name
'use client'

import Link from 'next/link'
import { ArrowRight, Landmark, ShieldCheck } from 'lucide-react'

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/75 backdrop-blur-xl">
      <div className="page-frame">
        <div className="flex min-h-[4.75rem] items-center justify-between gap-4">
          <Link href="/" className="group flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-[0_16px_30px_-18px_rgba(15,23,42,0.8)]">
              <Landmark className="h-5 w-5" />
            </span>
            <span className="flex flex-col">
              <span className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-slate-500">
                Plataforma Judicial
              </span>
              <span className="text-lg font-semibold tracking-tight text-slate-950">
                NOTIFICA IA
              </span>
            </span>
          </Link>

          <div className="hidden items-center gap-3 rounded-full border border-slate-200 bg-white/90 px-3 py-2 shadow-sm sm:flex">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span className="text-sm text-slate-600">
              Entorno operativo para oficinas receptoras
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-full px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950"
            >
              Inicio
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-[0_18px_32px_-20px_rgba(29,78,216,0.8)] hover:bg-blue-800"
            >
              Ingresar
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}

