// Gestionar Bancos page
// Full CRUD interface for managing bancos
'use client'

import { useState, useEffect } from 'react'
import Topbar from '@/components/Topbar'
import Link from 'next/link'
import GenericTable, { Column } from '@/components/GenericTable'
import AddEditModal from '@/components/AddEditModal'
import EmptyState from '@/components/EmptyState'
import { getData, createData, updateData, deleteData } from '@/lib/apiClient'
import { BancoSchema } from '@/lib/zodSchemas'
import { z } from 'zod'

type Banco = {
  id: number
  nombre: string
  cuenta: string | null
  createdAt: string
}

export default function BancosPage() {
  const [bancos, setBancos] = useState<Banco[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingBanco, setEditingBanco] = useState<Banco | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    loadBancos()
  }, [])

  const loadBancos = async () => {
    setIsLoading(true)
    const data = await getData<Banco[]>('/api/bancos')
    if (data) {
      setBancos(data)
    }
    setIsLoading(false)
  }

  const handleCreate = () => {
    setEditingBanco(null)
    setIsModalOpen(true)
  }

  const handleEdit = (banco: Banco) => {
    setEditingBanco(banco)
    setIsModalOpen(true)
  }

  const handleDelete = async (banco: Banco) => {
    const success = await deleteData(`/api/bancos/${banco.id}`)
    if (success) {
      await loadBancos()
    }
  }

  const handleSubmit = async (data: z.infer<typeof BancoSchema>) => {
    setIsSubmitting(true)
    try {
      if (editingBanco) {
        const updated = await updateData<Banco>(
          `/api/bancos/${editingBanco.id}`,
          data
        )
        if (updated) {
          await loadBancos()
          setIsModalOpen(false)
          setEditingBanco(null)
        }
      } else {
        const created = await createData<Banco>('/api/bancos', data)
        if (created) {
          await loadBancos()
          setIsModalOpen(false)
        }
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const columns: Column<Banco>[] = [
    {
      key: 'nombre',
      label: 'Nombre',
    },
    {
      key: 'cuenta',
      label: 'Cuenta',
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
                Gestión de Bancos
              </h1>
              <p className="text-gray-600">
                Administra los bancos del sistema
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
          {bancos.length === 0 && !isLoading ? (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
              <EmptyState
                icon="🏦"
                title="No hay bancos"
                message="Comienza agregando tu primer banco."
              />
            </div>
          ) : (
            <GenericTable
              columns={columns}
              rows={bancos}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isLoading={isLoading}
              emptyMessage="No se encontraron bancos."
              searchPlaceholder="Buscar bancos..."
            />
          )}

          {/* Modal */}
          <AddEditModal
            isOpen={isModalOpen}
            onClose={() => {
              setIsModalOpen(false)
              setEditingBanco(null)
            }}
            title={editingBanco ? 'Editar Banco' : 'Agregar Banco'}
            schema={BancoSchema}
            defaultValues={editingBanco || undefined}
            onSubmit={handleSubmit}
            submitLabel={editingBanco ? 'Actualizar' : 'Crear'}
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
