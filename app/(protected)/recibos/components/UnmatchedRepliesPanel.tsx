'use client'

import { AlertTriangle, Inbox, MailQuestion, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'

export type UnmatchedReplyItem = {
  id: string
  provider: string
  mailboxAddress: string
  senderEmail: string
  subject: string
  textPreview: string
  receivedAt: string
  matchStatus: 'unmatched' | 'needs_review'
  matchMethod: string | null
  candidateRecipientIds: unknown
}

export type UnmatchedReplyStatus = 'all' | 'unmatched' | 'needs_review'

export type UnmatchedReplyPagination = {
  page: number
  limit: number
  total: number
  totalPages: number
}

type Props = {
  items: UnmatchedReplyItem[]
  pagination: UnmatchedReplyPagination
  status: UnmatchedReplyStatus
  loading: boolean
  error: string | null
  onStatusChange: (status: UnmatchedReplyStatus) => void
  onPageChange: (page: number) => void
  onRefresh: () => void
}

function candidateCount(value: unknown) {
  return Array.isArray(value) ? value.filter(candidate => typeof candidate === 'string').length : 0
}

function receivedDate(value: string) {
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function statusBadge(status: UnmatchedReplyItem['matchStatus']) {
  if (status === 'needs_review') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900"><AlertTriangle className="h-3.5 w-3.5" />Revisión necesaria</span>
  }
  return <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"><MailQuestion className="h-3.5 w-3.5" />Sin asociar</span>
}

export default function UnmatchedRepliesPanel({
  items,
  pagination,
  status,
  loading,
  error,
  onStatusChange,
  onPageChange,
  onRefresh,
}: Props) {
  return (
    <section aria-labelledby="unmatched-replies-title" className="flex h-full min-h-0 flex-col bg-slate-50/60">
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="page-kicker">Bandeja de revisión</div>
            <h4 id="unmatched-replies-title" className="mt-1 text-lg font-semibold text-slate-950">Respuestas por asociar</h4>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">Mensajes que todavía no pueden vincularse con seguridad a un envío de recibos.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              Estado
              <select
                value={status}
                onChange={event => onStatusChange(event.target.value as UnmatchedReplyStatus)}
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <option value="all">Todos</option>
                <option value="needs_review">Revisión necesaria</option>
                <option value="unmatched">Sin asociar</option>
              </select>
            </label>
            <Button variant="outline" onClick={onRefresh} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Actualizar lista
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        {error && (
          <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {loading && !items.length && (
          <div role="status" className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-center text-slate-500">
            <RefreshCw className="h-6 w-6 animate-spin text-blue-700" />
            <p className="mt-3 text-sm">Cargando respuestas pendientes...</p>
          </div>
        )}

        {!loading && !error && !items.length && (
          <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/60 px-6 text-center">
            <span className="rounded-full bg-white p-3 text-emerald-700 shadow-sm"><Inbox className="h-6 w-6" /></span>
            <h5 className="mt-4 font-semibold text-slate-900">No hay respuestas pendientes</h5>
            <p className="mt-1 max-w-md text-sm text-slate-600">Las respuestas coincidentes permanecen vinculadas a su envío y no aparecen en esta bandeja.</p>
          </div>
        )}

        {!!items.length && (
          <>
            <div className="space-y-3 md:hidden">
              {items.map(reply => {
                const candidates = candidateCount(reply.candidateRecipientIds)
                return (
                  <article key={reply.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      {statusBadge(reply.matchStatus)}
                      <time className="text-xs text-slate-500">{receivedDate(reply.receivedAt)}</time>
                    </div>
                    <h5 className="mt-3 font-semibold text-slate-950">{reply.subject || 'Sin asunto'}</h5>
                    <p className="mt-1 break-all text-xs text-slate-500">{reply.senderEmail}</p>
                    <p className="mt-3 text-sm leading-6 text-slate-700">{reply.textPreview || 'Sin vista previa disponible.'}</p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1">{reply.provider}</span>
                      <span className="max-w-full truncate rounded-full bg-slate-100 px-2.5 py-1">{reply.mailboxAddress}</span>
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-800">{candidates} {candidates === 1 ? 'candidato' : 'candidatos'}</span>
                    </div>
                  </article>
                )
              })}
            </div>

            <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="bg-slate-100/80 text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Remitente</th>
                      <th className="px-4 py-3">Mensaje</th>
                      <th className="px-4 py-3">Origen</th>
                      <th className="px-4 py-3 text-center">Candidatos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map(reply => {
                      const candidates = candidateCount(reply.candidateRecipientIds)
                      return (
                        <tr key={reply.id} className="align-top hover:bg-slate-50/80">
                          <td className="px-4 py-4">{statusBadge(reply.matchStatus)}</td>
                          <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600">{receivedDate(reply.receivedAt)}</td>
                          <td className="max-w-52 px-4 py-4"><div className="break-all font-medium text-slate-900">{reply.senderEmail}</div></td>
                          <td className="max-w-md px-4 py-4"><div className="font-semibold text-slate-900">{reply.subject || 'Sin asunto'}</div><p className="mt-1 line-clamp-3 text-sm leading-5 text-slate-600">{reply.textPreview || 'Sin vista previa disponible.'}</p></td>
                          <td className="max-w-52 px-4 py-4 text-xs text-slate-600"><div className="font-semibold text-slate-800">{reply.provider}</div><div className="mt-1 break-all">{reply.mailboxAddress}</div></td>
                          <td className="px-4 py-4 text-center"><span className="inline-flex min-w-8 justify-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">{candidates}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <span>{pagination.total} {pagination.total === 1 ? 'respuesta pendiente' : 'respuestas pendientes'}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => onPageChange(pagination.page - 1)} disabled={loading || pagination.page <= 1}>Anterior</Button>
          <span className="min-w-24 text-center text-xs">Página {pagination.page} de {Math.max(1, pagination.totalPages)}</span>
          <Button variant="outline" onClick={() => onPageChange(pagination.page + 1)} disabled={loading || pagination.page >= pagination.totalPages}>Siguiente</Button>
        </div>
      </div>
    </section>
  )
}
