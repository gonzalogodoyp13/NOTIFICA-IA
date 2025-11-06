// Gestionar Tribunales page
// Full CRUD interface for managing tribunales
'use client'

import { useState, useEffect } from 'react'
import Topbar from '@/components/Topbar'
import Link from 'next/link'
import GenericTable, { Column } from '@/components/GenericTable'
import AddEditModal from '@/components/AddEditModal'
import EmptyState from '@/components/EmptyState'
import { getData, createData, updateData, deleteData } from '@/lib/apiClient'
import { TribunalSchema } from '@/lib/zodSchemas'
import { z } from 'zod'

type Tribunal = {
  id: number
  nombre: string
  direccion: string | null
  comuna: string | null
  createdAt: string
}

export default function TribunalesPage() {
  const [tribunales, setTribunales] = useState<Tribunal[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTribunal, setEditingTribunal] = useState<Tribunal | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    loadTribunales()
  }, [])

  const loadTribunales = async () => {
    setIsLoading(true)
    const data = await getData<Tribunal[]>('/api/tribunales')
    if (data) {
      setTribunales(data)
    }
    setIsLoading(false)
  }

  const handleCreate = () => {
    setEditingTribunal(null)
    setIsModalOpen(true)
  }

  const handleEdit = (tribunal: Tribunal) => {
    setEditingTribunal(tribunal)
    setIsModalOpen(true)
  }

  const handleDelete = async (tribunal: Tribunal) => {
    const success = await deleteData(`/api/tribunales/${tribunal.id}`)
    if (success) {
      await loadTribunales()
    }
  }

  const handleSubmit = async (data: z.infer<typeof TribunalSchema>) => {
    setIsSubmitting(true)
    try {
      if (editingTribunal) {
        const updated = await updateData<Tribunal>(
          `/api/tribunales/${editingTribunal.id}`,
          data
        )
        if (updated) {
          await loadTribunales()
          setIsModalOpen(false)
          setEditingTribunal(null)
        }
      } else {
        const created = await createData<Tribunal>('/api/tribunales', data)
        if (created) {
          await loadTribunales()
          setIsModalOpen(false)
        }
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const columns: Column<Tribunal>[] = [
    {
      key: 'nombre',
      label: 'Nombre',
    },
    {
      key: 'comuna',
      label: 'Comuna',
      render: (value) => value || '-',
    },
    {
      key: 'direccion',
      label: 'Dirección',
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
                Gestión de Tribunales
              </h1>
              <p className="text-gray-600">
                Administra los tribunales del sistema
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
          {tribunales.length === 0 && !isLoading ? (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
              <EmptyState
                icon="⚖️"
                title="No hay tribunales"
                message="Comienza agregando tu primer tribunal."
              />
            </div>
          ) : (
            <GenericTable
              columns={columns}
              rows={tribunales}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isLoading={isLoading}
              emptyMessage="No se encontraron tribunales."
              searchPlaceholder="Buscar tribunales..."
            />
          )}

          {/* Modal */}
          <AddEditModal
            isOpen={isModalOpen}
            onClose={() => {
              setIsModalOpen(false)
              setEditingTribunal(null)
            }}
            title={editingTribunal ? 'Editar Tribunal' : 'Agregar Tribunal'}
            schema={TribunalSchema}
            defaultValues={editingTribunal || undefined}
            onSubmit={handleSubmit}
            submitLabel={editingTribunal ? 'Actualizar' : 'Crear'}
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
