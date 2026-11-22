import Link from 'next/link'
import { requireOwnerPage } from '@/lib/operations/auth'
import './operations.css'
import OperationsNavigation from './navigation'
export const dynamic = 'force-dynamic'
export default async function OperationsLayout({ children }: { children: React.ReactNode }) {
  await requireOwnerPage()
  return <div className="ops-shell"><a className="ops-skip" href="#operations-main">Saltar al contenido</a><header className="ops-header"><Link href="/operaciones" className="ops-brand">NOTIFICA <span>IA</span><small>Centro de Operaciones</small></Link><div className="ops-private">Acceso privado · Propietario · MFA</div><Link href="/dashboard">Volver a mi oficina</Link></header><div className="ops-frame"><aside className="ops-sidebar"><p>SUPERVISIÓN</p><OperationsNavigation /><div className="ops-sidebar-note">Evidencia antes de actuar.<br />Esta fase permite investigar y documentar incidentes.</div></aside><main id="operations-main" className="ops-main">{children}</main></div></div>
}
