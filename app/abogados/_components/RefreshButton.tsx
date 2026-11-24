'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

export default function RefreshButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <button type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-bold text-slate-700 hover:bg-slate-100 focus-visible:outline-blue-600 disabled:opacity-60">
      <RefreshCw className={`size-4 ${pending ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
      {pending ? 'Actualizando…' : 'Actualizar'}
    </button>
  )
}
