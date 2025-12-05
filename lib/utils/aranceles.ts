/**
 * Utilidades para búsqueda de Aranceles
 * 
 * Funciones para encontrar aranceles basados en contexto de ROL/Demanda
 * para auto-completar montos en Boletas/Estampos
 */

import { prisma } from '@/lib/prisma'

/**
 * Busca el arancel correcto para un Estampo dado un contexto de ROL
 * 
 * Orden de prioridad:
 * 1. Arancel específico del Abogado para este Estampo en este Banco
 * 2. Arancel del Banco (banco-wide) para este Estampo
 * 3. null (no encontrado, monto debe ser manual)
 * 
 * @param officeId - ID de la oficina
 * @param bancoId - ID del banco (puede venir de demanda o abogado.bancoId)
 * @param abogadoId - ID del abogado (de demanda.abogadoId)
 * @param estampoId - ID del estampo seleccionado
 * @returns Arancel encontrado con monto y fuente, o null si no se encontró
 * 
 * @example
 * const arancel = await lookupArancel(1, 5, 10, "abc123")
 * if (arancel) {
 *   console.log(`Arancel: $${arancel.monto} (${arancel.source})`)
 *   // Arancel: $14000 (abogado)
 * }
 */
export async function lookupArancel(
  officeId: number,
  bancoId: number | null,
  abogadoId: number | null,
  estampoId: string
): Promise<{ monto: number; source: 'abogado' | 'banco' } | null> {
  if (!bancoId || !estampoId) {
    return null
  }

  // Prioridad 1: Arancel específico del Abogado
  if (abogadoId) {
    const abogadoArancel = await prisma.arancel.findFirst({
      where: {
        officeId,
        bancoId,
        abogadoId,
        estampoId,
        activo: true,
      },
    })

    if (abogadoArancel) {
      return { monto: abogadoArancel.monto, source: 'abogado' }
    }
  }

  // Prioridad 2: Arancel banco-wide
  const bancoArancel = await prisma.arancel.findFirst({
    where: {
      officeId,
      bancoId,
      abogadoId: null,
      estampoId,
      activo: true,
    },
  })

  if (bancoArancel) {
    return { monto: bancoArancel.monto, source: 'banco' }
  }

  // No se encontró arancel
  return null
}

/**
 * NOTA PARA INTEGRACIÓN FUTURA:
 * 
 * Esta función está lista para ser usada en:
 * - app/api/diligencias/[id]/estampo/route.ts
 * - app/(protected)/roles/[id]/diligencias/EstampoModal.tsx
 * - app/(protected)/roles/[id]/diligencias/BoletaModal.tsx
 * 
 * Ejemplo de uso en EstampoModal:
 * 
 * ```typescript
 * const handleEstampoSelect = async (estampoId: string) => {
 *   const rol = await fetchRol() // obtener rol con demanda.abogadoId
 *   const arancel = await lookupArancel(
 *     user.officeId,
 *     rol.demanda?.abogado?.bancoId,
 *     rol.demanda?.abogadoId,
 *     estampoId
 *   )
 *   
 *   if (arancel) {
 *     setMonto(arancel.monto)
 *     setArancelSource(arancel.source) // mostrar "Arancel: $12.000 (Banco)"
 *   }
 * }
 * ```
 * 
 * Consideraciones:
 * - Si abogado tiene múltiples bancos, usar banco principal (abogado.bancoId)
 * - Si no hay banco asociado al abogado, no hay arancel disponible
 * - Si estampo está inactivo, no buscar arancel (estampo no debería estar disponible)
 */

