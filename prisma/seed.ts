import { PrismaClient } from '@prisma/client'
import { busquedasNegativasSeeds } from '../lib/estampos/busquedasNegativasSeeds'

const prisma = new PrismaClient()

async function seedEstamposBase() {
  for (const seed of busquedasNegativasSeeds) {
    await prisma.estampoBase.upsert({
      where: { slug: seed.slug },
      create: {
        slug: seed.slug,
        nombreVisible: seed.nombreVisible,
        categoria: seed.categoria,
        descripcion: seed.descripcion,
        textoTemplate: seed.textoTemplate,
        variablesSchema: seed.variablesSchema as any,
        wizardSchema: seed.wizardSchema as any,
      },
      update: {
        nombreVisible: seed.nombreVisible,
        categoria: seed.categoria,
        descripcion: seed.descripcion,
        textoTemplate: seed.textoTemplate,
        variablesSchema: seed.variablesSchema as any,
        wizardSchema: seed.wizardSchema as any,
        isActive: true,
        version: { increment: 1 },
      },
    })
  }
}

async function main() {
  try {
    console.log('🌱 Iniciando seeding de EstampoBase...')
    await seedEstamposBase()
    console.log('✅ Seeding completado exitosamente')
  } catch (error) {
    console.error('❌ Error durante el seeding:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })

