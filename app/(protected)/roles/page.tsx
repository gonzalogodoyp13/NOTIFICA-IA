'use client'

import { ArrowLeft, FileSearch, Plus, Scale } from 'lucide-react'
import { useEffect, useState } from 'react'
import Topbar from '@/components/Topbar'
import Link from 'next/link'

interface Demanda {
  id: string
  rol: string
  caratula: string
  cuantia: number
  createdAt: string
  tribunales: {
    id: number
    nombre: string
  } | null
  abogados: {
    id: number
    nombre: string | null
  } | null
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Demanda[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const response = await fetch('/api/roles', {
          credentials: 'include',
        })
        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data.error || 'Error al cargar los roles')
        }
        const data = await response.json()
        if (data.ok) {
          setRoles(data.data || [])
        } else {
          setError(data.error || 'Error al cargar los roles')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido')
      } finally {
        setLoading(false)
      }
    }

    fetchRoles()
  }, [])

  return (
    <div className="app-shell">
      <Topbar />

      <main className="page-frame page-stack">
        <section className="page-header">
          <div>
            <div className="page-kicker">Casos</div>
            <h1 className="page-title">Gestionar Roles (Casos ROL)</h1>
            <p className="page-copy">
              Visualiza y administra todos los casos ROL en una tabla mas clara, sin
              alterar el flujo actual de trabajo.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="app-panel-muted flex items-center gap-3 px-4 py-3">
              <Scale className="h-4 w-4 text-blue-700" />
              <span className="text-sm font-medium text-slate-600">
                {loading ? 'Cargando listado...' : `${roles.length} casos visibles`}
              </span>
            </div>
            <Link
              href="/demandas/nueva"
              className="inline-flex items-center gap-2 rounded-full bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_36px_-20px_rgba(29,78,216,0.75)] hover:bg-blue-800"
            >
              <Plus className="h-4 w-4" />
              Nuevo Caso
            </Link>
          </div>
        </section>

        {loading && (
          <section className="app-section p-8">
            <div className="space-y-4">
              <div className="h-5 w-40 animate-pulse rounded-full bg-slate-200" />
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="h-14 animate-pulse rounded-2xl bg-slate-100" />
                ))}
              </div>
            </div>
          </section>
        )}

        {error && !loading && (
          <div className="mb-6 rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700 shadow-sm">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {roles.length === 0 ? (
              <section className="app-section p-10 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] bg-slate-900 text-white shadow-lg">
                  <FileSearch className="h-7 w-7" />
                </div>
                <h2 className="mt-6 text-2xl font-semibold text-slate-950">
                  No hay casos ROL registrados aun.
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">
                  Crea tu primer caso desde el boton superior. La funcionalidad se mantiene
                  igual; esta vista solo mejora la presentacion del listado.
                </p>
              </section>
            ) : (
              <section className="app-section overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">Listado de casos</h2>
                    <p className="text-sm text-slate-500">
                      Vista general de roles registrados en la oficina.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50/90 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <tr>
                        <th className="px-6 py-4">ROL</th>
                        <th className="px-6 py-4">Caratula</th>
                        <th className="px-6 py-4">Tribunal</th>
                        <th className="px-6 py-4">Abogado</th>
                        <th className="px-6 py-4">Fecha</th>
                        <th className="px-6 py-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {roles.map((rol) => (
                        <tr key={rol.id} className="group hover:bg-slate-50/80">
                          <td className="px-6 py-5 whitespace-nowrap">
                            <Link
                              href={`/roles/${rol.id}`}
                              className="inline-flex rounded-full bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-800 transition group-hover:bg-blue-100"
                            >
                              {rol.rol}
                            </Link>
                          </td>
                          <td className="px-6 py-5 text-sm text-slate-700">
                            {rol.caratula || 'Sin caratula'}
                          </td>
                          <td className="px-6 py-5 text-sm text-slate-600">
                            {rol.tribunales?.nombre ?? 'Sin tribunal'}
                          </td>
                          <td className="px-6 py-5 text-sm text-slate-600">
                            {rol.abogados?.nombre ?? 'Sin abogado'}
                          </td>
                          <td className="px-6 py-5 whitespace-nowrap text-sm text-slate-500">
                            {new Date(rol.createdAt).toLocaleDateString('es-CL')}
                          </td>
                          <td className="px-6 py-5 whitespace-nowrap text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Link
                                href={`/roles/${rol.id}/editar`}
                                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                              >
                                Editar
                              </Link>
                              <Link
                                href={`/roles/${rol.id}`}
                                className="rounded-full bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
                              >
                                Ver detalles
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}

        <div className="mt-8 flex items-center gap-4 flex-wrap">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al Dashboard
          </Link>
        </div>
      </main>
    </div>
  )
}
