// Gestionar Comunas page
// Full CRUD interface for managing comunas
'use client'

import { useState, useEffect } from 'react'
import Topbar from '@/components/Topbar'
import Link from 'next/link'
import GenericTable, { Column } from '@/components/GenericTable'
import AddEditModal from '@/components/AddEditModal'
import EmptyState from '@/components/EmptyState'
import { getData, createData, updateData, deleteData } from '@/lib/apiClient'
import { ComunaSchema } from '@/lib/zodSchemas'
import { z } from 'zod'

type Comuna = {
  id: number
  nombre: string
  region: string | null
  createdAt: string
}

export default function ComunasPage() {
  const [comunas, setComunas] = useState<Comuna[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingComuna, setEditingComuna] = useState<Comuna | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    loadComunas()
  }, [])

  const loadComunas = async () => {
    setIsLoading(true)
    const data = await getData<Comuna[]>('/api/comunas')
    if (data) {
      setComunas(data)
    }
    setIsLoading(false)
  }

  const handleCreate = () => {
    setEditingComuna(null)
    setIsModalOpen(true)
  }

  const handleEdit = (comuna: Comuna) => {
    setEditingComuna(comuna)
    setIsModalOpen(true)
  }

  const handleDelete = async (comuna: Comuna) => {
    const success = await deleteData(`/api/comunas/${comuna.id}`)
    if (success) {
      await loadComunas()
    }
  }

  const handleSubmit = async (data: z.infer<typeof ComunaSchema>) => {
    setIsSubmitting(true)
    try {
      if (editingComuna) {
        const updated = await updateData<Comuna>(
          `/api/comunas/${editingComuna.id}`,
          data
        )
        if (updated) {
          await loadComunas()
          setIsModalOpen(false)
          setEditingComuna(null)
        }
      } else {
        const created = await createData<Comuna>('/api/comunas', data)
        if (created) {
          await loadComunas()
          setIsModalOpen(false)
        }
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const columns: Column<Comuna>[] = [
    {
      key: 'nombre',
      label: 'Nombre',
    },
    {
      key: 'region',
      label: 'Región',
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
                Gestión de Comunas
              </h1>
              <p className="text-gray-600">
                Administra las comunas disponibles
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
          {comunas.length === 0 && !isLoading ? (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
              <EmptyState
                icon="🗺️"
                title="No hay comunas"
                message="Comienza agregando tu primera comuna."
              />
            </div>
          ) : (
            <GenericTable
              columns={columns}
              rows={comunas}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isLoading={isLoading}
              emptyMessage="No se encontraron comunas."
              searchPlaceholder="Buscar comunas..."
            />
          )}

          {/* Modal */}
          <AddEditModal
            isOpen={isModalOpen}
            onClose={() => {
              setIsModalOpen(false)
              setEditingComuna(null)
            }}
            title={editingComuna ? 'Editar Comuna' : 'Agregar Comuna'}
            schema={ComunaSchema}
            defaultValues={editingComuna || undefined}
            onSubmit={handleSubmit}
            submitLabel={editingComuna ? 'Actualizar' : 'Crear'}
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
