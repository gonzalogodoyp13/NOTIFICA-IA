import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAbogadoAccount } from '@/lib/auth/abogadoAccount'
import AjustesForm from './AjustesForm'

export const metadata: Metadata = { title: 'Ajustes | NOTIFICA IA' }

export default async function AjustesPage() {
  const account = await getAbogadoAccount()
  if (!account) redirect('/login')

  return (
    <div className="max-w-6xl">
      <header className="mb-5">
        <h1 className="page-title">Ajustes</h1>
        <p className="mt-1 text-sm text-slate-600">Tus datos, las preferencias de boleta y el acceso a tu cuenta.</p>
      </header>
      <AjustesForm contactoInicial={account.contacto} boletaInicial={account.boleta} />
    </div>
  )
}
