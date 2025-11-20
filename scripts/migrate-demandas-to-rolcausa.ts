// Migration script: Create RolCausa for existing Demandas
// This script should be run ONCE after schema migration
// Run with: npx tsx scripts/migrate-demandas-to-rolcausa.ts

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🚀 Starting migration: Creating RolCausa for existing Demandas...\n')

  // 1. Get all Demandas that don't have a corresponding RolCausa
  const demandas = await prisma.demanda.findMany({
    include: {
      tribunales: true,
    },
  })

  console.log(`📊 Found ${demandas.length} Demandas in database\n`)

  let created = 0
  let updated = 0
  let skipped = 0
  let errors = 0

  for (const demanda of demandas) {
    try {
      // Check if RolCausa already exists
      const existingRolCausa = await prisma.rolCausa.findUnique({
        where: { id: demanda.id },
      })

      if (existingRolCausa) {
        console.log(`⏭️  Skipping Demanda ${demanda.id} - RolCausa already exists`)
        skipped++
        continue
      }

      // Find or create Tribunal (String ID) from tribunales (Int ID)
      let tribunal = await prisma.tribunal.findFirst({
        where: {
          nombre: demanda.tribunales.nombre,
          officeId: demanda.officeId,
        },
      })

      if (!tribunal) {
        tribunal = await prisma.tribunal.create({
          data: {
            nombre: demanda.tribunales.nombre,
            direccion: demanda.tribunales.direccion,
            comuna: demanda.tribunales.comuna,
            officeId: demanda.officeId,
          },
        })
        console.log(`  ✅ Created Tribunal: ${tribunal.id} (${tribunal.nombre})`)
      }

      // Create RolCausa with the same ID as Demanda
      await prisma.rolCausa.create({
        data: {
          id: demanda.id, // Same ID as Demanda
          demandaId: demanda.id, // Auto-reference
          rol: demanda.rol,
          officeId: demanda.officeId,
          tribunalId: tribunal.id, // String ID from Tribunal
          estado: 'pendiente',
          createdAt: demanda.createdAt,
        },
      })

      console.log(`✅ Created RolCausa for Demanda ${demanda.id} (ROL: ${demanda.rol})`)
      created++
    } catch (error: any) {
      console.error(`❌ Error processing Demanda ${demanda.id}:`, error.message)
      errors++

      // If it's a unique constraint error, try to update instead
      if (error.code === 'P2002') {
        try {
          await prisma.rolCausa.update({
            where: { id: demanda.id },
            data: {
              demandaId: demanda.id,
              rol: demanda.rol,
              officeId: demanda.officeId,
              estado: 'pendiente',
            },
          })
          console.log(`  ✅ Updated existing RolCausa for Demanda ${demanda.id}`)
          updated++
          errors--
        } catch (updateError) {
          console.error(`  ❌ Failed to update RolCausa:`, updateError)
        }
      }
    }
  }

  console.log('\n📈 Migration Summary:')
  console.log(`  ✅ Created: ${created}`)
  console.log(`  🔄 Updated: ${updated}`)
  console.log(`  ⏭️  Skipped: ${skipped}`)
  console.log(`  ❌ Errors: ${errors}`)
  console.log('\n✨ Migration completed!')
}

main()
  .catch((e) => {
    console.error('❌ Migration failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

