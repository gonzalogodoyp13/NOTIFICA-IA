'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function SetPasswordPage() {
  const token = useRef<string | null>(null)
  const verifiedUser = useRef<string | null>(null)
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    // Fragments stay out of HTTP requests and server logs. Do not consume the
    // invitation on page load: email scanners must not activate the account.
    const params = new URLSearchParams(window.location.hash.slice(1))
    if (params.get('token_hash')) token.current = params.get('token_hash')
    window.history.replaceState(null, '', window.location.pathname)
    setReady(Boolean(token.current))
  }, [])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setError('')
    if (password.length < 12) return setError('Usa al menos 12 caracteres.')
    if (password !== confirmation) return setError('Las contraseñas no coinciden.')
    setBusy(true)
    try {
      if (!verifiedUser.current) {
        if (!token.current) throw new Error('Abre el enlace de invitación que recibiste por correo.')
        const { data, error: verifyError } = await supabase.auth.verifyOtp({ token_hash: token.current, type: 'invite' })
        if (verifyError || !data.user) throw new Error('El enlace expiró o ya fue utilizado. Solicita una nueva invitación.')
        verifiedUser.current = data.user.id
        token.current = null
      }
      // A different tab could have changed the shared browser session.
      const { data, error: userError } = await supabase.auth.getUser()
      if (userError || data.user?.id !== verifiedUser.current) throw new Error('La sesión cambió. Vuelve a abrir tu invitación o solicita una nueva.')
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw new Error('No se pudo guardar la contraseña. Prueba una contraseña más larga y difícil de adivinar, o intenta nuevamente.')
      setPassword('')
      setConfirmation('')
      await supabase.auth.signOut({ scope: 'local' })
      setDone(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo completar la solicitud. Intenta nuevamente.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="app-shell min-h-screen px-4 py-16">
      <section className="app-section mx-auto max-w-lg p-8 sm:p-10">
        <p className="text-sm font-semibold tracking-widest text-blue-700">NOTIFICA IA</p>
        <h1 className="mt-5 text-3xl font-semibold text-slate-900">{done ? 'Tu cuenta está lista' : 'Crea tu contraseña'}</h1>
        {done ? (
          <div role="status" className="mt-5 space-y-6">
            <p className="text-slate-600">Ya puedes ingresar con tu correo y la contraseña que elegiste.</p>
            <Link href="/login" className="inline-flex rounded-2xl bg-blue-700 px-6 py-3 font-semibold text-white">Ir a iniciar sesión</Link>
          </div>
        ) : (
          <>
            <p className="mt-4 text-slate-600">Activa tu acceso a la oficina. Elige una contraseña de al menos 12 caracteres.</p>
            {!ready ? <p role="status" className="mt-6 text-slate-600">Abre el enlace de invitación que recibiste por correo. Si expiró o ya fue utilizado, solicita uno nuevo.</p> : (
              <form onSubmit={submit} className="mt-8 space-y-5">
                <div>
                  <label htmlFor="new-password" className="field-label">Nueva contraseña</label>
                  <input id="new-password" type="password" autoComplete="new-password" minLength={12} required disabled={busy} value={password} onChange={event => setPassword(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-slate-300 px-4 focus:outline-none focus:ring-2 focus:ring-blue-600" />
                </div>
                <div>
                  <label htmlFor="confirm-password" className="field-label">Repite la contraseña</label>
                  <input id="confirm-password" type="password" autoComplete="new-password" minLength={12} required disabled={busy} value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-slate-300 px-4 focus:outline-none focus:ring-2 focus:ring-blue-600" />
                </div>
                {error && <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
                <button type="submit" disabled={busy} className="h-12 w-full rounded-2xl bg-blue-700 font-semibold text-white hover:bg-blue-800 disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar contraseña'}</button>
              </form>
            )}
          </>
        )}
      </section>
    </main>
  )
}
