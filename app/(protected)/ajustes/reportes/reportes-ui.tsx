'use client'

import { AlertTriangle, CheckCircle2, Clock3, FileX2, Loader2, ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'

export function formatDateTime(value: string | null) {
  return value ? new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'
}

export function formatBytes(value: number | null) {
  if (value === null || value === undefined) return '—'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export function reportTypeLabel(value: string) { return value === 'monthly' ? 'Mensual' : value === 'custom' ? 'Personalizado' : 'Diario' }
export function modeLabel(value: string) { return value === 'SCHEDULED' ? 'Programado' : 'Manual' }
export function targetLabel(value: string) { return value === 'FAILED_ONLY' ? 'Solo fallidos' : 'Todos los autorizados' }
export function authorizationLabel(value: string) { return value === 'REVOKED' ? 'Autorización revocada' : 'Autorizado' }

const labels: Record<string, string> = {
  ready: 'Disponible', expired: 'Vencido', not_sent: 'No enviado', pending: 'Pendiente', sent: 'Enviado', partial: 'Parcial', failed: 'Fallido',
  READY: 'Disponible', CORRUPT: 'Corrupta', FAILED: 'Fallida', DELETED: 'Eliminada', DELETE_FAILED: 'Error al limpiar', UPLOADING: 'Generando', DELETE_PENDING: 'Eliminando',
  SENT: 'Enviado', PARTIAL: 'Parcial', NO_RECIPIENTS: 'Sin destinatarios', PENDING: 'Pendiente', SENDING: 'Enviando', PREPARED: 'Preparado', SKIPPED: 'Omitido',
  QUEUED: 'En cola', RUNNING: 'En ejecución', CANCEL_REQUESTED: 'Cancelando', SUCCEEDED: 'Completado', CANCELLED: 'Cancelado',
  DISABLED: 'Desactivada', HEALTHY: 'Saludable', ATTENTION: 'Atención', CRITICAL: 'Crítica',
  ACTIVE: 'Activa', ARCHIVED: 'Archivada',
}

export function statusLabel(value: string) { return labels[value] ?? value }

export function StatusBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase()
  const positive = ['ready', 'sent', 'succeeded', 'healthy'].includes(normalized)
  const warning = ['partial', 'pending', 'sending', 'uploading', 'delete_pending', 'queued', 'running', 'cancel_requested', 'attention'].includes(normalized)
  const negative = ['failed', 'corrupt', 'delete_failed', 'critical'].includes(normalized)
  const Icon = positive ? CheckCircle2 : warning ? Clock3 : negative ? AlertTriangle : normalized === 'expired' || normalized === 'deleted' ? FileX2 : ShieldAlert
  const tone = positive ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : warning ? 'border-amber-200 bg-amber-50 text-amber-900' : negative ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-slate-200 bg-slate-100 text-slate-700'
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" />{statusLabel(value)}</span>
}

export function LoadingBlock({ label }: { label: string }) {
  return <div role="status" className="flex min-h-52 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white/75 text-sm text-slate-500"><Loader2 className="h-6 w-6 animate-spin text-blue-700" /><span className="mt-3">{label}</span></div>
}

export function EmptyBlock({ icon, title, copy }: { icon: ReactNode; title: string; copy: string }) {
  return <div className="flex min-h-52 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white/75 px-6 text-center"><span className="rounded-2xl bg-slate-100 p-3 text-slate-600">{icon}</span><h3 className="mt-4 font-semibold text-slate-950">{title}</h3><p className="mt-1 max-w-md text-sm leading-6 text-slate-600">{copy}</p></div>
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-900 sm:flex-row sm:items-center sm:justify-between"><span>{message}</span><button type="button" onClick={onRetry} className="rounded-xl border border-rose-300 bg-white px-3 py-2 font-semibold">Reintentar</button></div>
}

export const selectClassName = 'h-11 rounded-2xl border border-slate-200 bg-white/95 px-4 text-sm text-slate-800 shadow-sm focus-visible:border-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100'
