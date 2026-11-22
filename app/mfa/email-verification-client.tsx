'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { signOut } from '@/lib/auth-client'

const messages:Record<string,string>={INVALID_EMAIL_CODE:'El código es incorrecto, venció o ya fue utilizado.',EMAIL_SEND_LIMITED:'Alcanzaste el límite de envíos. Espera una hora antes de solicitar otro código.',EMAIL_VERIFY_LIMITED:'Demasiados intentos. Espera 15 minutos.',PASSWORD_LOGIN_REQUIRED:'Vuelve a iniciar sesión con tu contraseña.',VERIFIED_OWNER_EMAIL_REQUIRED:'No se pudo confirmar el correo autorizado de esta cuenta.',EMAIL_DELIVERY_UNCONFIRMED:'No pudimos confirmar el envío. Espera un minuto y solicita un código nuevo.'}
export default function EmailVerificationClient(){
  const [code,setCode]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[destination,setDestination]=useState('tu correo autorizado'),[wait,setWait]=useState(0)
  const started=useRef(false),inFlight=useRef(false)
  useEffect(()=>{if(wait<=0)return;const timer=setTimeout(()=>setWait(v=>Math.max(0,v-1)),1000);return()=>clearTimeout(timer)},[wait])
  const request=useCallback(async(action:'start'|'verify')=>{
    if(inFlight.current)return
    inFlight.current=true;setBusy(true);setMessage('')
    try {
      const response=await fetch('/api/auth/owner-verification',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action==='start'?{action}:{action,code})})
      const body=await response.json()
      if(!response.ok)throw new Error(messages[body.error?.code]??'La verificación no está disponible. Intenta nuevamente en unos minutos.')
      if(!body.required)throw new Error('Esta cuenta no tiene verificación por correo habilitada.')
      setDestination(body.destination)
      if(action==='verify'){setCode('');window.location.assign('/operaciones');return}
      setWait(body.retryAfter??60);setMessage(body.sent?'Código enviado. Revisa tu bandeja de entrada y spam.':'Ya se solicitó un código recientemente. Usa el último correo recibido.')
    }catch(error){setMessage((error as Error).message);if(action==='verify')setCode('')}
    finally{setBusy(false);inFlight.current=false}
  },[code])
  useEffect(()=>{if(!started.current){started.current=true;void request('start')}},[request]) // one request per mounted login screen; server cooldown handles reloads
  return <section className="app-panel space-y-5 p-6 sm:p-7" aria-busy={busy}>
    <p className="text-sm text-slate-600">Destino: <strong>{destination}</strong></p>
    <form onSubmit={e=>{e.preventDefault();void request('verify')}} className="space-y-4">
      <label htmlFor="owner-email-code" className="field-label">Código de seis dígitos</label>
      <input id="owner-email-code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} disabled={busy} className="h-14 w-full rounded-2xl border border-slate-300 px-4 text-center font-mono text-2xl tracking-[0.3em] focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"/>
      <p className="text-sm text-slate-600">Vence en 5 minutos. No compartas el código con nadie.</p>
      <button disabled={busy||code.length!==6} className="h-11 w-full rounded-2xl bg-blue-700 px-4 font-semibold text-white disabled:opacity-50">{busy?'Procesando…':'Verificar y entrar'}</button>
    </form>
    <p role="status" aria-live="polite" className="text-sm text-slate-700">{message}</p>
    <button type="button" onClick={()=>void request('start')} disabled={busy||wait>0} className="min-h-11 w-full rounded-xl border border-slate-300 px-4 text-sm font-semibold disabled:opacity-50">{wait>0?`Solicitar otro código en ${wait} s`:'Solicitar otro código'}</button>
    <button type="button" disabled={busy} className="min-h-11 w-full text-sm text-blue-700 underline" onClick={async()=>{await signOut();window.location.assign('/login')}}>Cerrar sesión y volver al inicio</button>
  </section>
}
