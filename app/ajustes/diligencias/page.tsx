// Gestionar Diligencias page
// Full CRUD interface for managing diligencias tipos
'use client'

import { useState, useEffect } from 'react'
import Topbar from '@/components/Topbar'
import Link from 'next/link'
import GenericTable, { Column } from '@/components/GenericTable'
import AddEditModal from '@/components/AddEditModal'
import EmptyState from '@/components/EmptyState'
import { getData, createData, updateData, deleteData } from '@/lib/apiClient'
import { DiligenciaTipoSchema } from '@/lib/zodSchemas'
import { z } from 'zod'

type DiligenciaTipo = {
  id: number
  nombre: string
  descripcion: string | null
  createdAt: string
}

export default function DiligenciasPage() {
  const [diligencias, setDiligencias] = useState<DiligenciaTipo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingDiligencia, setEditingDiligencia] =
    useState<DiligenciaTipo | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    loadDiligencias()
  }, [])

  const loadDiligencias = async () => {
    setIsLoading(true)
    const data = await getData<DiligenciaTipo[]>('/api/diligencias')
    if (data) {
      setDiligencias(data)
    }
    setIsLoading(false)
  }

  const handleCreate = () => {
    setEditingDiligencia(null)
    setIsModalOpen(true)
  }

  const handleEdit = (diligencia: DiligenciaTipo) => {
    setEditingDiligencia(diligencia)
    setIsModalOpen(true)
  }

  const handleDelete = async (diligencia: DiligenciaTipo) => {
    const success = await deleteData(`/api/diligencias/${diligencia.id}`)
    if (success) {
      await loadDiligencias()
    }
  }

  const handleSubmit = async (data: z.infer<typeof DiligenciaTipoSchema>) => {
    setIsSubmitting(true)
    try {
      if (editingDiligencia) {
        const updated = await updateData<DiligenciaTipo>(
          `/api/diligencias/${editingDiligencia.id}`,
          data
        )
        if (updated) {
          await loadDiligencias()
          setIsModalOpen(false)
          setEditingDiligencia(null)
        }
      } else {
        const created = await createData<DiligenciaTipo>(
          '/api/diligencias',
          data
        )
        if (created) {
          await loadDiligencias()
          setIsModalOpen(false)
        }
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const columns: Column<DiligenciaTipo>[] = [
    {
      key: 'nombre',
      label: 'Nombre',
    },
    {
      key: 'descripcion',
      label: 'Descripción',
      render: (value) => value || '-',
    },
    {
      key: 'createdAt',
      label: 'Fecha de Creación',
      render: (value) =>
        new Date(value as string).toLocaleDateString('es-CL'),
    },
  ]

  return (
    <div className="min-h-screen bg-white">
      <Topbar />

      <main className="pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Page header */}
          <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 mb-2">
                Gestión de Diligencias
              </h1>
              <p className="text-gray-600">
                Administra los tipos de diligencias
              </p>
            </div>
            <button
              onClick={handleCreate}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              + Agregar
            </button>
          </div>

          {/* Table or Empty State */}
          {diligencias.length === 0 && !isLoading ? (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
              <EmptyState
                icon="📋"
                title="No hay tipos de diligencias"
                message="Comienza agregando tu primer tipo de diligencia."
              />
            </div>
          ) : (
            <GenericTable
              columns={columns}
              rows={diligencias}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isLoading={isLoading}
              emptyMessage="No se encontraron tipos de diligencias."
              searchPlaceholder="Buscar diligencias..."
            />
          )}

          {/* Modal */}
          <AddEditModal
            isOpen={isModalOpen}
            onClose={() => {
              setIsModalOpen(false)
              setEditingDiligencia(null)
            }}
            title={
              editingDiligencia
                ? 'Editar Tipo de Diligencia'
                : 'Agregar Tipo de Diligencia'
            }
            schema={DiligenciaTipoSchema}
            defaultValues={editingDiligencia || undefined}
            onSubmit={handleSubmit}
            submitLabel={editingDiligencia ? 'Actualizar' : 'Crear'}
            isLoading={isSubmitting}
          />

          {/* Back links */}
          <div className="mt-8 flex items-center gap-4 flex-wrap">
            <Link
              href="/ajustes"
              className="text-blue-600 hover:text-blue-800 font-medium transition-colors inline-flex items-center gap-2"
            >
              ← Volver a Ajustes
            </Link>
            <span className="text-gray-400">•</span>
            <Link
              href="/dashboard"
              className="text-blue-600 hover:text-blue-800 font-medium transition-colors inline-flex items-center gap-2"
            >
              ← Volver al Dashboard
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
