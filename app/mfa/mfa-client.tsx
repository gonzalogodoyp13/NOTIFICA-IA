'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function MfaClient() {
  const [factors, setFactors] = useState<{ id: string; friendly_name?: string }[]>([])
  const [factorId, setFactorId] = useState(''), [qr, setQr] = useState(''), [code, setCode] = useState('')
  const [busy, setBusy] = useState(true), [message, setMessage] = useState('')
  useEffect(() => { let mounted = true; void supabase.auth.mfa.listFactors().then(({ data, error }) => {
    if (!mounted) return
    if (error) setMessage('No se pudo consultar MFA. Intenta recargar la página.')
    else { const available = data.totp.filter(f => f.status === 'verified'); setFactors(available); setFactorId(available[0]?.id ?? '') }
    setBusy(false)
  }).catch(() => { if (mounted) { setMessage('No se pudo conectar con autenticación.'); setBusy(false) } }); return () => { mounted = false } }, [])
  async function enroll() {
    setBusy(true); setMessage('')
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Operaciones ${new Date().toISOString().slice(0, 16)}` })
      if (error) throw error
      setFactorId(data.id); setQr(data.totp.qr_code)
    } catch { setMessage('No se pudo iniciar el registro. Comprueba que TOTP esté habilitado en Supabase.') } finally { setBusy(false) }
  }
  async function verify(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
      if (error) throw error
      setCode(''); setQr(''); window.location.assign('/operaciones')
    } catch { setMessage('Código inválido o vencido. Intenta nuevamente.'); setCode('') } finally { setBusy(false) }
  }
  return <section className="rounded-2xl border bg-white p-6 shadow-sm" aria-busy={busy}>
    {message && <p role="alert" className="mb-4 text-red-700">{message}</p>}
    {!factorId && <button type="button" disabled={busy} className="rounded-lg bg-primary px-4 py-3 text-white disabled:opacity-50" onClick={enroll}>{busy ? 'Consultando…' : 'Configurar aplicación autenticadora'}</button>}
    {qr && <><p>Escanea este QR con tu autenticador. No lo compartas.</p>{/* Auth-generated QR is kept in memory only. */}<img src={qr} alt="Código QR para configurar tu autenticador" width={240} height={240} /></>}
    {factorId && <form onSubmit={verify} className="space-y-4">
      {factors.length > 1 && <label className="block">Autenticador<select className="mt-2 w-full rounded-lg border p-3" value={factorId} onChange={e => setFactorId(e.target.value)}>{factors.map(f => <option key={f.id} value={f.id}>{f.friendly_name || 'Autenticador'}</option>)}</select></label>}
      <label className="block">Código de seis dígitos<input className="mt-2 w-full rounded-lg border p-3 text-xl tracking-widest" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /></label>
      <button className="rounded-lg bg-primary px-4 py-3 text-white disabled:opacity-50" disabled={busy || code.length !== 6}>{busy ? 'Verificando…' : 'Verificar y entrar'}</button>
    </form>}
  </section>
}
