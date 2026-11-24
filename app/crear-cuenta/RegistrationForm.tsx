'use client'

import { useState, type FormEvent, type InputHTMLAttributes } from 'react'
import { BriefcaseBusiness, CalendarDays, CircleCheck, Landmark } from 'lucide-react'

const options = [
  { value: 'abogado', label: 'Quiero encargar', icon: BriefcaseBusiness },
  { value: 'receptor', label: 'Receptor judicial', icon: Landmark },
] as const

type AccountType = typeof options[number]['value']

export default function RegistrationForm({ terms }: { terms: { url: string; version: string } | null }) {
  const [type, setType] = useState<AccountType>('abogado')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || (type === 'abogado' && !terms)) return

    const form = new FormData(event.currentTarget)
    const contact = { nombre: form.get('nombre'), email: form.get('email') }
    const body = type === 'abogado'
      ? { type, ...contact, apellidos: form.get('apellidos'), password: form.get('password'),
          acceptedTerms: form.has('acceptedTerms'), termsVersion: terms?.version }
      : { type, ...contact, celular: form.get('celular') }

    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/auth/registration', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const result = await response.json()
      if (!response.ok) {
        setError(result.error || 'No pudimos procesar la solicitud. Intenta nuevamente.')
        return
      }
      if (result.status === 'authenticated') {
        window.location.assign('/abogados')
        return
      }
      setConfirmation(result.status === 'check_email'
        ? 'Revisa tu correo para confirmar tu cuenta. Si ya tienes una cuenta, puedes iniciar sesión.'
        : 'Recibimos tu solicitud. Usaremos tus datos de contacto para coordinar la consulta.')
    } catch {
      setError('No pudimos procesar la solicitud. Intenta nuevamente.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <fieldset className="mt-6 grid grid-cols-2 gap-2 sm:gap-3" disabled={busy}>
        <legend className="sr-only">Tipo de cuenta</legend>
        {options.map(({ value, label, icon: Icon }) => (
          <label key={value} className="min-w-0 cursor-pointer">
            <input type="radio" name="accountType" value={value} checked={type === value}
              onChange={() => { setType(value); setError(''); setConfirmation('') }} className="peer sr-only" />
            <span className="flex h-full min-h-16 flex-col items-start justify-center gap-2 rounded-2xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 peer-checked:border-blue-600 peer-checked:bg-blue-50 peer-checked:text-blue-900 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-600 peer-focus-visible:ring-offset-2 sm:flex-row sm:items-center sm:justify-start sm:px-4">
              <Icon className="size-5 shrink-0" aria-hidden="true" />{label}
            </span>
          </label>
        ))}
      </fieldset>

      {confirmation ? (
        <div role="status" className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <CircleCheck className="size-5 shrink-0" aria-hidden="true" />{confirmation}
        </div>
      ) : (
        <form key={type} method="post" onSubmit={submit} className="mt-6 space-y-4" aria-busy={busy}>
          <fieldset disabled={busy} className="space-y-4">
            <legend className="sr-only">Datos de {type === 'abogado' ? 'la cuenta' : 'contacto'}</legend>
            <div className={type === 'abogado' ? 'grid gap-4 sm:grid-cols-2' : undefined}>
              <Field name="nombre" label="Nombre" autoComplete={type === 'abogado' ? 'given-name' : 'name'} maxLength={100} />
              {type === 'abogado' && <Field name="apellidos" label="Apellidos" autoComplete="family-name" maxLength={100} />}
            </div>
            {type === 'receptor' && <Field name="celular" label="Celular" type="tel" autoComplete="tel" maxLength={30} />}
            <Field name="email" label="Correo" type="email" autoComplete="email" maxLength={254} />

            {type === 'abogado' && (
              <>
                <Field name="password" label="Contraseña" type="password" autoComplete="new-password" minLength={12} maxLength={72} aria-describedby="signup-password-help" />
                <p className="text-sm text-slate-600" id="signup-password-help">Usa al menos 12 caracteres.</p>
                <div className="flex items-start gap-3 text-sm text-slate-700">
                  <input id="acceptedTerms" name="acceptedTerms" type="checkbox" required disabled={!terms} aria-label="Acepto los Términos y Condiciones"
                    className="mt-0.5 size-4 shrink-0 accent-blue-700" />
                  <div>
                    <label htmlFor="acceptedTerms">
                      {terms ? 'Acepto los ' : 'Acepto los Términos y Condiciones'}
                    </label>
                    {terms && <a href={terms.url} target="_blank" rel="noreferrer" className="font-semibold text-blue-800 underline underline-offset-4">Términos y Condiciones</a>}
                  </div>
                </div>
                {!terms && <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">La creación de cuentas estará disponible cuando se publiquen los términos.</p>}
              </>
            )}

            {error && <p role="alert" className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
            <button type="submit" disabled={type === 'abogado' && !terms}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 font-semibold text-white shadow-sm hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
              {type === 'receptor' && <CalendarDays className="size-5" aria-hidden="true" />}
              {busy ? 'Enviando…' : type === 'abogado' ? 'Crear cuenta' : 'Agendar consulta'}
            </button>
          </fieldset>
        </form>
      )}
    </>
  )
}

function Field({ label, name, ...input }: InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  return (
    <div className="min-w-0">
      <label htmlFor={`registration-${name}`} className="mb-1.5 block text-sm font-semibold text-slate-800">{label}</label>
      <input {...input} id={`registration-${name}`} name={name} required
        className="h-12 w-full rounded-2xl border border-slate-300 bg-white px-3.5 text-slate-950 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600" />
    </div>
  )
}
