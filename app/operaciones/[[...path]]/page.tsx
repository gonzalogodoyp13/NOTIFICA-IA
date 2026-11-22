import Link from 'next/link'
import { z } from 'zod'
import { notFound } from 'next/navigation'
import { requireOwnerPage, OperationsAccessError } from '@/lib/operations/auth'
import { loadOperations } from '@/lib/operations/queries'
import { incidentStatuses, statusLabels } from '@/lib/operations/policy'
import IncidentEditor from '../incident-editor'
import Freshness from '../freshness'
import AlertControls from '../alert-controls'
import RecoveryControls from '../recovery-controls'

export default async function OperationsPage({ params, searchParams }: { params: Promise<{ path?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireOwnerPage()
  const { path = [] } = await params, raw = await searchParams
  const filters = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]))
  let view
  try { view = await loadOperations(path, filters) } catch (error) {
    if (error instanceof OperationsAccessError && error.status === 404) notFound()
    if (error instanceof z.ZodError || error instanceof OperationsAccessError && error.status === 400) return <section className="ops-panel"><h1>Filtros no válidos</h1><p>Revisa las fechas, oficina y página. El rango máximo es de 366 días.</p><Link href={`/operaciones/${path.join('/')}`}>Restablecer filtros</Link></section>
    throw error
  }
  const page = Math.max(1, Number(filters.page) || 1)
  const paginationLink = (next: number) => { const q = new URLSearchParams(Object.entries(filters).filter((entry): entry is [string, string] => typeof entry[1] === 'string')); q.set('page', String(next)); return `?${q}` }
  const scopedLink = (href: string) => {
    const [pathname, query] = href.split('?'), q = new URLSearchParams(query)
    for (const key of ['office', 'from', 'to']) if (filters[key] && !q.has(key)) q.set(key, filters[key]!)
    if (pathname.includes('/incidentes/') && filters.q) q.set('q', filters.q)
    return `${pathname}${q.size ? `?${q}` : ''}`
  }
  return <>
    <Freshness refreshedAt={view.refreshedAt} autoRefresh={!view.incident && !view.configuration && !view.recovery} />
    <div className="ops-title"><div><p className="ops-eyebrow">VISIBILIDAD OPERACIONAL</p><h1>{view.title}</h1><p>{view.subtitle}</p></div><div className="ops-refresh"><span>Consultado</span><time dateTime={view.refreshedAt}>{new Date(view.refreshedAt).toLocaleString('es-CL', { timeZone: 'America/Santiago' })}</time><Link href={`?${new URLSearchParams(Object.entries(filters).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))}`}>Actualizar datos</Link></div></div>
    <form className="ops-filters" method="get">{(['incidentes', 'oficinas', 'usuarios', 'tokens', 'trabajos', 'reportes', 'recibos', 'correos'].includes(path[0]) && (!path[1] || path[0] === 'incidentes')) && <label>Buscar / referencia<input name="q" defaultValue={filters.q} placeholder="Referencia, operación, usuario…" maxLength={100} /></label>}<label>Oficina (ID)<input name="office" type="number" min="1" defaultValue={filters.office} placeholder="Todas" /></label><label>Desde (UTC)<input name="from" type="date" defaultValue={filters.from} /></label><label>Hasta (UTC)<input name="to" type="date" defaultValue={filters.to} /></label>
      {path[0] === 'incidentes' && !path[1] && <><label>Estado<select name="status" defaultValue={filters.status ?? ''}><option value="">Todos</option>{incidentStatuses.map(s => <option key={s} value={s}>{statusLabels[s]}</option>)}</select></label><label>Severidad<select name="severity" defaultValue={filters.severity ?? ''}><option value="">Todas</option><option value="critical">Crítica</option><option value="error">Error</option><option value="warning">Advertencia</option></select></label></>}
      {path[0] === 'trabajos' && <label>Estado de firma<select name="state" defaultValue={filters.state ?? ''}><option value="">Todos</option>{[['QUEUED', 'En cola'], ['CLAIMED', 'Reclamado'], ['SIGNING', 'Creando firma'], ['RETRY_PENDING', 'Reintentando'], ['WAITING_FOR_OPERATOR', 'Intervención'], ['FAILED', 'Fallido'], ['COMPLETED', 'Completado'], ['CANCELLED', 'Cancelado']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      <button type="submit">Aplicar filtros</button><Link href={`/operaciones/${path.join('/')}`}>Limpiar</Link>
    </form><p className="ops-caption">Período predeterminado: últimos 7 días. Una referencia exacta busca toda la evidencia conservada si no eliges fechas. Directorios, colas y conectividad muestran el estado actual.</p>
    {view.stats && <section aria-label="Indicadores" className="ops-stats">{view.stats.map(s => <div key={s.label} className={`ops-stat ${s.tone ? `ops-${s.tone}` : ''}`}><span>{s.label}</span><strong>{s.value}</strong></div>)}</section>}
    {view.attention && <section className="ops-panel"><h2>Necesita tu atención</h2>{view.attention.length ? <ul className="ops-attention">{view.attention.map((a, i) => <li key={i} className={`ops-${a.tone}`}><Link href={scopedLink(a.href)}>{a.text}</Link></li>)}</ul> : <p>No hay alertas en la evidencia consultada. Esto no confirma la disponibilidad de servicios externos.</p>}</section>}
    {view.facts && <section className="ops-panel"><h2>Contexto y límites de la evidencia</h2><dl className="ops-facts">{view.facts.map(f => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl></section>}
    {view.incident && <IncidentEditor incident={view.incident} />}
    {view.configuration && <AlertControls view={view} />}
    {view.recovery && <RecoveryControls initial={view.recovery} />}
    {path[0]==='tokens'&&path[1]&&<p><Link href={`/operaciones/recuperacion?kind=device&targetId=${encodeURIComponent(path[1])}${filters.office?`&office=${encodeURIComponent(filters.office)}`:''}`}>Inspeccionar opciones de recuperación del equipo</Link></p>}
    {path[1] && ['incidentes','tokens'].includes(path[0]) && <section className="ops-panel"><h2>Paquete diagnóstico</h2><p>Incluye hasta 100 registros conservados. Excluye contenido de documentos, identidades personales y notas libres.</p><a href={`/api/operaciones/exportar/${path[0]}/${encodeURIComponent(path[1])}${filters.office ? `?office=${encodeURIComponent(filters.office)}` : ''}`}>Descargar diagnóstico JSON privado</a></section>}
    {view.guide && <section className="ops-panel"><h2>Guía: {view.guide.code}</h2><p>Versión {view.guide.version} · la evidencia puede estar vencida; comprueba sus fechas.</p><dl className="ops-facts">{[['Qué pasó',view.guide.happened],['A quién afecta',view.guide.affected],['Impacto',view.guide.impact],['Evidencia / causa confirmada',view.guide.confirmed],['Posibles causas (sin confirmar)',view.guide.possible.join('\n')],['Acción recomendada',view.guide.action],['Cómo verificar la solución',view.guide.verify],['Mensaje sugerido para el usuario',view.guide.message]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><h3>Qué revisar, en este orden</h3><ol>{view.guide.review.map(step => <li key={step}>{step}</li>)}</ol></section>}
    {view.tables.map((table, index) => <section className="ops-panel" key={`${table.title}-${index}`}><h2>{table.title}</h2>{table.description && <p className="ops-caption">{table.description}</p>}{!table.rows.length ? <div className="ops-empty"><strong>Sin registros para esta consulta</strong><p>Prueba otro período o filtro. La ausencia de registros no demuestra que no hayan ocurrido errores.</p></div> : <div className="ops-table-scroll" tabIndex={0} role="region" aria-label={table.title}><table><thead><tr>{table.columns.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead><tbody>{table.rows.map((row, i) => <tr key={i}>{row.map((c, j) => <td key={j}>{c.href ? <Link href={scopedLink(c.href)}>{c.text}</Link> : c.text}</td>)}</tr>)}</tbody></table></div>}</section>)}
    {view.tables.length > 0 && <nav className="ops-pagination" aria-label="Paginación">{page > 1 ? <Link href={paginationLink(page - 1)}>Anterior</Link> : <span>Anterior</span>}<span>Página {page} · hasta 25 registros por sección</span>{page < 1000 && view.tables.some(t => t.more) ? <Link href={paginationLink(page + 1)}>Siguiente</Link> : <span>Siguiente</span>}</nav>}
  </>
}
