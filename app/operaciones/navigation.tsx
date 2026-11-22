'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
const entries = [['', 'Resumen general'], ['incidentes', 'Incidentes'], ['oficinas', 'Oficinas'], ['usuarios', 'Usuarios'], ['tokens', 'Control de tokens'], ['trabajos', 'Firmas y trabajos'], ['reportes', 'Reportes'], ['recibos', 'Recibos'], ['correos', 'Correos'], ['salud', 'Salud de servicios'], ['guias', 'Guías de diagnóstico'], ['alertas', 'Alertas y comunicaciones'], ['recuperacion', 'Recuperación segura']]
export default function OperationsNavigation() {
  const pathname = usePathname()
  return <nav aria-label="Centro de Operaciones">{entries.map(([path, name]) => {
    const href = `/operaciones${path ? `/${path}` : ''}`
    const active = path ? pathname.startsWith(href) : pathname === href
    return <Link key={path} href={href} aria-current={active ? 'page' : undefined}>{name}</Link>
  })}</nav>
}
