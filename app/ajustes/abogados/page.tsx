// Gestionar Abogados page
// Full CRUD interface for managing abogados with banco selection
'use client'

import { useState, useEffect } from 'react'
import Topbar from '@/components/Topbar'
import Link from 'next/link'
import GenericTable, { Column } from '@/components/GenericTable'
import AddEditModal from '@/components/AddEditModal'
import EmptyState from '@/components/EmptyState'
import { getData, createData, updateData, deleteData } from '@/lib/apiClient'
import { AbogadoSchema } from '@/lib/zodSchemas'
import { z } from 'zod'

type Banco = {
  id: number
  nombre: string
  cuenta: string | null
  createdAt: string
}

type Abogado = {
  id: number
  nombre: string | null
  rut: string | null
  direccion: string | null
  comuna: string | null
  telefono: string | null
  email: string | null
  bancoId: number | null
  banco: {
    nombre: string
  } | null
  createdAt: string
}

export default function AbogadosPage() {
  const [abogados, setAbogados] = useState<Abogado[]>([])
  const [bancos, setBancos] = useState<Banco[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingAbogado, setEditingAbogado] = useState<Abogado | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    const [abogadosData, bancosData] = await Promise.all([
      getData<Abogado[]>('/api/abogados'),
      getData<Banco[]>('/api/bancos'),
    ])

    if (abogadosData) {
      setAbogados(abogadosData)
    }
    if (bancosData) {
      setBancos(bancosData)
    }
    setIsLoading(false)
  }

  const handleCreate = () => {
    setEditingAbogado(null)
    setIsModalOpen(true)
  }

  const handleEdit = (abogado: Abogado) => {
    setEditingAbogado(abogado)
    setIsModalOpen(true)
  }

  const handleDelete = async (abogado: Abogado) => {
    const success = await deleteData(`/api/abogados/${abogado.id}`)
    if (success) {
      await loadData()
    }
  }

  const handleSubmit = async (data: z.infer<typeof AbogadoSchema>) => {
    setIsSubmitting(true)
    try {
      if (editingAbogado) {
        const updated = await updateData<Abogado>(
          `/api/abogados/${editingAbogado.id}`,
          data
        )
        if (updated) {
          await loadData()
          setIsModalOpen(false)
          setEditingAbogado(null)
        }
      } else {
        const created = await createData<Abogado>('/api/abogados', data)
        if (created) {
          await loadData()
          setIsModalOpen(false)
        }
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const columns: Column<Abogado>[] = [
    {
      key: 'nombre',
      label: 'Nombre',
      render: (value) => value || '-',
    },
    {
      key: 'rut',
      label: 'RUT',
      render: (value) => value || '-',
    },
    {
      key: 'email',
      label: 'Email',
      render: (value) => value || '-',
    },
    {
      key: 'telefono',
      label: 'Teléfono',
      render: (value) => value || '-',
    },
    {
      key: 'banco',
      label: 'Banco',
      render: (value, row) => row.banco?.nombre || '-',
    },
    {
      key: 'createdAt',
      label: 'Fecha de Creación',
      render: (value) =>
        new Date(value as string).toLocaleDateString('es-CL'),
    },
  ]

  // Prepare select options for bancoId
  const selectOptions = {
    bancoId: [
      ...bancos.map((banco) => ({
        value: banco.id,
        label: banco.nombre,
      })),
    ],
  }

  return (
    <div className="min-h-screen bg-white">
      <Topbar />

      <main className="pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Page header */}
          <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 mb-2">
                Gestión de Abogados
              </h1>
              <p className="text-gray-600">
                Administra los abogados asociados a tu oficina
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
          {abogados.length === 0 && !isLoading ? (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8">
              <EmptyState
                icon="👨‍⚖️"
                title="No hay abogados"
                message="Comienza agregando tu primer abogado."
              />
            </div>
          ) : (
            <GenericTable
              columns={columns}
              rows={abogados}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isLoading={isLoading}
              emptyMessage="No se encontraron abogados."
              searchPlaceholder="Buscar abogados..."
            />
          )}

          {/* Modal */}
          <AddEditModal
            isOpen={isModalOpen}
            onClose={() => {
              setIsModalOpen(false)
              setEditingAbogado(null)
            }}
            title={editingAbogado ? 'Editar Abogado' : 'Agregar Abogado'}
            schema={AbogadoSchema}
            defaultValues={editingAbogado || undefined}
            onSubmit={handleSubmit}
            submitLabel={editingAbogado ? 'Actualizar' : 'Crear'}
            isLoading={isSubmitting}
            selectOptions={selectOptions}
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
