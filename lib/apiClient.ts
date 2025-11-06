// API client helpers for CRUD operations
// Provides typed wrappers for fetch with error handling and toast notifications
import toast from 'react-hot-toast'

export interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: string | Array<{ path: string[]; message: string }>
  message?: string
}

/**
 * Generic GET request
 */
export async function getData<T>(endpoint: string): Promise<T | null> {
  try {
    const response = await fetch(endpoint)
    const result: ApiResponse<T> = await response.json()

    if (!response.ok || !result.ok) {
      const errorMessage =
        typeof result.error === 'string'
          ? result.error
          : 'Error al obtener los datos'
      toast.error(errorMessage)
      return null
    }

    return result.data || null
  } catch (error) {
    console.error('Error fetching data:', error)
    toast.error('Error de conexión al obtener los datos')
    return null
  }
}

/**
 * Generic POST request (create)
 */
export async function createData<T>(
  endpoint: string,
  data: unknown
): Promise<T | null> {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    const result: ApiResponse<T> = await response.json()

    if (!response.ok || !result.ok) {
      const errorMessage =
        typeof result.error === 'string'
          ? result.error
          : Array.isArray(result.error) && result.error.length > 0
          ? result.error[0].message
          : 'Error al crear el registro'
      toast.error(errorMessage)
      return null
    }

    toast.success('Registro creado correctamente')
    return result.data || null
  } catch (error) {
    console.error('Error creating data:', error)
    toast.error('Error de conexión al crear el registro')
    return null
  }
}

/**
 * Generic PUT request (update)
 */
export async function updateData<T>(
  endpoint: string,
  data: unknown
): Promise<T | null> {
  try {
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    const result: ApiResponse<T> = await response.json()

    if (!response.ok || !result.ok) {
      const errorMessage =
        typeof result.error === 'string'
          ? result.error
          : Array.isArray(result.error) && result.error.length > 0
          ? result.error[0].message
          : 'Error al actualizar el registro'
      toast.error(errorMessage)
      return null
    }

    toast.success('Registro actualizado correctamente')
    return result.data || null
  } catch (error) {
    console.error('Error updating data:', error)
    toast.error('Error de conexión al actualizar el registro')
    return null
  }
}

/**
 * Generic DELETE request
 */
export async function deleteData(endpoint: string): Promise<boolean> {
  try {
    const response = await fetch(endpoint, {
      method: 'DELETE',
    })

    const result: ApiResponse<unknown> = await response.json()

    if (!response.ok || !result.ok) {
      const errorMessage =
        typeof result.error === 'string'
          ? result.error
          : 'Error al eliminar el registro'
      toast.error(errorMessage)
      return false
    }

    toast.success('Registro eliminado correctamente')
    return true
  } catch (error) {
    console.error('Error deleting data:', error)
    toast.error('Error de conexión al eliminar el registro')
    return false
  }
}

