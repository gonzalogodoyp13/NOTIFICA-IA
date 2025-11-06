// Gestionar Materias page
// Full CRUD interface for managing materias
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Topbar from '@/components/Topbar'
import Link from 'next/link'
import GenericTable, { Column } from '@/components/GenericTable'
import AddEditModal from '@/components/AddEditModal'
import EmptyState from '@/components/EmptyState'
import { getData, createData, updateData, deleteData } from '@/lib/apiClient'
import { MateriaSchema } from '@/lib/zodSchemas'
import { z } from 'zod'

type Materia = {
  id: number
  nombre: string
  createdAt: string
}

export default function MateriasPage() {
  const router = useRouter()
  const [materias, setMaterias] = useState<Materia[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingMateria, setEditingMateria] = useState<Materia | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    loadMaterias()
  }, [])

  const loadMaterias = async () => {
    setIsLoading(true)
    const data = await getData<Materia[]>('/api/materias')
    if (data) {
      setMaterias(data)
    }
    setIsLoading(false)
  }

  const handleCreate = () => {
    setEditingMateria(null)
    setIsModalOpen(true)
  }

  const handleEdit = (materia: Materia) => {
    setEditingMateria(materia)
    setIsModalOpen(true)
  }

  const handleDelete = async (materia: Materia) => {
    const success = await deleteData(`/api/materias/${materia.id}`)
    if (success) {
      await loadMaterias()
    }
  }

  const handleSubmit = async (data: z.infer<typeof MateriaSchema>) => {
    setIsSubmitting(true)
    try {
      if (editingMateria) {
        const updated = await updateData<Materia>(
          `/api/materias/${editingMateria.id}`,
          data
        )
        if (updated) {
          await loadMaterias()
          setIsModalOpen(false)
          setEditingMateria(null)
        }
      } else {
        const created = await createData<Materia>('/api/materias', data)
        if (created) {
          await loadMaterias()
          setIsModalOpen(false)
        }
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const columns: Column<Materia>[] = [
    {
      key: 'nombre',
      label: 'Nombre',
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
                Gestión de Materias
              </h1>
              <p className="text-gray-600">
                Administra las materias legales de tu oficina
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
          {materias.length === 0 && !isLoading ? (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
              <EmptyState
                icon="📚"
                title="No hay materias"
                message="Comienza agregando tu primera materia legal."
              />
            </div>
          ) : (
            <GenericTable
              columns={columns}
              rows={materias}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isLoading={isLoading}
              emptyMessage="No se encontraron materias."
              searchPlaceholder="Buscar materias..."
            />
          )}

          {/* Modal */}
          <AddEditModal
            isOpen={isModalOpen}
            onClose={() => {
              setIsModalOpen(false)
              setEditingMateria(null)
            }}
            title={editingMateria ? 'Editar Materia' : 'Agregar Materia'}
            schema={MateriaSchema}
            defaultValues={editingMateria || undefined}
            onSubmit={handleSubmit}
            submitLabel={editingMateria ? 'Actualizar' : 'Crear'}
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
