'use client'

import { Button } from '@/components/ui/button'
import type { Pagination } from './reportes-types'

export default function PaginationBar({ pagination, loading, noun, onPageChange }: { pagination: Pagination; loading: boolean; noun: string; onPageChange: (page: number) => void }) {
  return <div className="flex flex-col gap-3 border-t border-slate-200 bg-white/80 px-4 py-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
    <span>{pagination.total} {pagination.total === 1 ? noun : `${noun}s`}</span>
    <div className="flex items-center gap-2"><Button size="sm" variant="outline" onClick={() => onPageChange(pagination.page - 1)} disabled={loading || pagination.page <= 1}>Anterior</Button><span className="min-w-28 text-center text-xs">Página {pagination.page} de {Math.max(1, pagination.totalPages)}</span><Button size="sm" variant="outline" onClick={() => onPageChange(pagination.page + 1)} disabled={loading || pagination.page >= pagination.totalPages}>Siguiente</Button></div>
  </div>
}
