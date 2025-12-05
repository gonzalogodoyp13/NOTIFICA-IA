import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function migrate() {
  console.log('Iniciando migración de Abogado-Banco...')
  
  // Obtener todos los Abogados con bancoId no nulo
  const abogadosConBanco = await prisma.abogado.findMany({
    where: {
      bancoId: { not: null }
    },
    select: {
      id: true,
      officeId: true,
      bancoId: true
    }
  })

  console.log(`Encontrados ${abogadosConBanco.length} abogados con banco asignado`)

  let created = 0
  let errors = 0

  for (const abogado of abogadosConBanco) {
    try {
      // Verificar que el banco existe y pertenece a la misma oficina
      const banco = await prisma.banco.findFirst({
        where: {
          id: abogado.bancoId!,
          officeId: abogado.officeId
        }
      })

      if (!banco) {
        console.warn(`Banco ${abogado.bancoId} no encontrado o no pertenece a officeId ${abogado.officeId} para Abogado ${abogado.id}`)
        errors++
        continue
      }

      // Crear relación en AbogadoBanco (usar createMany con skipDuplicates)
      await prisma.abogadoBanco.createMany({
        data: [{
          officeId: abogado.officeId,
          abogadoId: abogado.id,
          bancoId: abogado.bancoId!
        }],
        skipDuplicates: true
      })

      created++
    } catch (error) {
      console.error(`Error procesando Abogado ${abogado.id}:`, error)
      errors++
    }
  }

  console.log(`Migración completada: ${created} relaciones creadas, ${errors} errores`)
}

migrate()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

