'use client'
import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'

export default function MfaSetup() {
  const [factor, setFactor] = useState('')
  const [qr, setQr] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    supabase.auth.mfa.listFactors().then(({ data, error }) => {
      if (!active) return
      if (error) { setError('No se pudo consultar tu verificacion. Recarga la pagina.'); return }
      setFactor(data.totp.find(item => item.status === 'verified')?.id ?? '')
      setReady(true)
    }).catch(() => { if (active) setError('No se pudo conectar al servicio de acceso.') })
    return () => { active = false }
  }, [])
  async function enroll() {
    setBusy(true); setError('')
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `NOTIFICA ${Date.now()}` })
      if (error) throw error
      setFactor(data.id); setQr(data.totp.qr_code); setSecret(data.totp.secret)
    } catch { setError('No se pudo iniciar la configuracion. Intenta nuevamente o contacta a soporte.') }
    finally { setBusy(false) }
  }
  async function verify(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor, code })
      if (error) throw error
      setSecret(''); setQr(''); window.location.replace('/dashboard')
    } catch { setError('Codigo incorrecto o vencido. Ingresa el codigo actual de tu aplicacion.'); setCode('') }
    finally { setBusy(false) }
  }
  return <main className="app-shell min-h-screen flex items-center justify-center p-6">
    <section className="app-section w-full max-w-lg p-8 space-y-6">
      <ShieldCheck size={36} className="text-blue-800" aria-hidden="true" />
      <div><p className="text-sm font-semibold text-blue-800">ACCESO DE ADMINISTRADOR</p>
        <h1 className="text-2xl font-semibold mt-2">Protege tu cuenta</h1>
        <p className="mt-3 text-slate-600">Para acceder a tu oficina, verifica tu identidad con una aplicacion de autenticacion.</p></div>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {!ready ? <p role="status">Comprobando tu cuenta…</p> : !factor ? <>
        <p>Usa Google Authenticator, Microsoft Authenticator u otra aplicacion compatible. Podras escanear un codigo QR y confirmar con seis digitos.</p>
        <button className="btn-primary w-full" disabled={busy} onClick={enroll}>Configurar autenticador</button>
      </> : <form onSubmit={verify} className="space-y-4">
        {qr && <><p>Escanea este codigo con tu aplicacion. No lo compartas.</p>
          {/* Provider-generated SVG is used only as an image, never injected HTML. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Codigo QR para configurar tu autenticador" width={220} height={220} className="mx-auto" />
          <details><summary>Ingresar clave manualmente</summary><code className="break-all">{secret}</code></details></>}
        <label className="block" htmlFor="mfa-code">Codigo de seis digitos</label>
        <input id="mfa-code" className="w-full rounded-lg border p-3 text-xl tracking-widest" inputMode="numeric" autoComplete="one-time-code"
          pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} />
        <button className="btn-primary w-full" disabled={busy || code.length !== 6}>{busy ? 'Verificando…' : 'Verificar y entrar'}</button>
      </form>}
      <p className="text-sm text-slate-500">Si perdiste tu autenticador, solicita a soporte la recuperacion de tu cuenta. No compartas codigos ni claves.</p>
      <button className="text-sm underline" onClick={async () => { await supabase.auth.signOut(); window.location.replace('/login') }}>Cerrar sesion</button>
    </section>
  </main>
}
