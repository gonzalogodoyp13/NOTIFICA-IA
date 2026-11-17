'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No pudimos procesar la solicitud. Intenta nuevamente.')
      setMessage(result.message)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos procesar la solicitud. Intenta nuevamente.')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <div className="app-shell min-h-screen px-4 py-12 sm:py-20">
      <section className="app-section mx-auto max-w-lg p-6 sm:p-10" aria-labelledby="recovery-title">
        <div className="page-kicker">Recupera tu acceso</div>
        <h1 id="recovery-title" className="page-title">¿Olvidaste tu contraseña?</h1>
        <p className="page-copy mt-4">Ingresa el correo de tu cuenta y te enviaremos un enlace para elegir una nueva contraseña.</p>
        {message ? (
          <div role="status" className="mt-8 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-blue-900">{message}</div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="recovery-email" className="field-label">Correo electrónico</label>
              <input id="recovery-email" name="email" type="email" autoComplete="email" required maxLength={254} disabled={busy} value={email} onChange={event => setEmail(event.target.value)} placeholder="nombre@oficina.cl" className="mt-2 h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50" />
            </div>
            {error && <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
            <button type="submit" disabled={busy} className="h-12 w-full rounded-2xl bg-blue-700 px-4 font-semibold text-white hover:bg-blue-800 disabled:opacity-50">{busy ? 'Enviando…' : 'Enviar enlace de recuperación'}</button>
          </form>
        )}
        <Link href="/login" className="mt-7 inline-block rounded text-sm font-semibold text-blue-700 underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-blue-600">Volver a iniciar sesión</Link>
      </section>
    </div>
  )
}
