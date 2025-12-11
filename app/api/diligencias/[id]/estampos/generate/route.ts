import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import fs from 'fs'
import path from 'path'

import { getCurrentUserWithOffice } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import {
  buildInitialVariables,
  computeDerivedVariables,
  renderEstampoTemplate,
  type DiligenciaWithRelations,
} from '@/lib/estampos/runtime'
import { buildEstampoPdf } from '@/lib/estampos/pdf'
import { type HeaderData } from '@/lib/pdf/header'
import type { VariableDef } from '@/lib/estampos/types'

export const dynamic = 'force-dynamic'

// Input validation schema
const GenerateEstampoSchema = z.object({
  estampoBaseId: z.number().int().positive(),
  wizardAnswers: z.record(z.string(), z.string()),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUserWithOffice()

    if (!user) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }

    // Get user with officeName from database
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { officeName: true },
    })

    // Parse and validate input
    const body = await req.json()
    const parsed = GenerateEstampoSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Datos inválidos', details: parsed.error.format() },
        { status: 400 }
      )
    }

    const { estampoBaseId, wizardAnswers } = parsed.data

    // Load diligencia with all relations (same pattern as wizard endpoint)
    const diligencia = await prisma.diligencia.findFirst({
      where: {
        id: params.id,
        rol: {
          officeId: user.officeId,
        },
      },
      include: {
        rol: {
          include: {
            tribunal: {
              select: {
                id: true,
                nombre: true,
              },
            },
            demanda: {
              include: {
                abogados: {
                  include: {
                    banco: true,
                  },
                },
                ejecutados: {
                  include: {
                    comunas: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!diligencia) {
      return NextResponse.json(
        { ok: false, error: 'Diligencia no encontrada o no pertenece a tu oficina' },
        { status: 404 }
      )
    }

    // Cast to DiligenciaWithRelations - we know the include matches the expected structure
    const diligenciaWithRelations = diligencia as DiligenciaWithRelations

    // Load EstampoBase
    const estampoBase = await prisma.estampoBase.findFirst({
      where: {
        id: estampoBaseId,
        isActive: true,
      },
    })

    if (!estampoBase) {
      return NextResponse.json(
        { ok: false, error: 'Estampo no encontrado o inactivo' },
        { status: 404 }
      )
    }

    // Load EstampoCustom if exists
    const estampoCustom = await prisma.estampoCustom.findFirst({
      where: {
        baseId: estampoBase.id,
        officeId: user.officeId,
        isActive: true,
      },
    })

    // Determine final textoTemplate (custom overrides base)
    const textoTemplate = estampoCustom?.textoTemplate ?? estampoBase.textoTemplate

    // Build complete variables
    const initialVariables = buildInitialVariables({
      diligencia: diligenciaWithRelations,
      rol: diligenciaWithRelations.rol,
      estampoBase,
      estampoCustom,
      dbUser,
    })

    const combined = {
      ...initialVariables,
      ...wizardAnswers,
    }

    const variablesSchema = estampoBase.variablesSchema as unknown as VariableDef[]
    const derived = computeDerivedVariables(combined, variablesSchema)

    const finalVariables = {
      ...combined,
      ...derived,
    }

    // Validate required variables
    const requiredVariables = variablesSchema.filter(v => v.required)
    const missing: string[] = []

    for (const variableDef of requiredVariables) {
      const value = finalVariables[variableDef.name]
      if (!value || value.trim() === '') {
        missing.push(variableDef.name)
      }
    }

    if (missing.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Faltan variables requeridas',
          missing,
        },
        { status: 400 }
      )
    }

    // Render template
    const finalText = renderEstampoTemplate(textoTemplate, finalVariables)

    // Load signature and seal images (same pattern as legacy route)
    const firmaPath = path.resolve('./public/mock-firma.png')
    const selloPath = path.resolve('./public/mock-sello.png')
    const officeImages: { firma?: Uint8Array; sello?: Uint8Array } = {}

    if (fs.existsSync(firmaPath)) {
      officeImages.firma = await fs.promises.readFile(firmaPath)
    }

    if (fs.existsSync(selloPath)) {
      officeImages.sello = await fs.promises.readFile(selloPath)
    }

    // Build header data
    const headerData: HeaderData = {
      receptorNombre: dbUser?.officeName ?? 'Receptor Judicial',
      tribunalNombre: diligenciaWithRelations.rol.tribunal?.nombre ?? null,
      rolNumero: diligenciaWithRelations.rol.rol,
      bancoNombre: diligenciaWithRelations.rol.demanda?.abogados?.banco?.nombre ?? null,
      ejecutadoNombre: finalVariables.nombre_ejecutado || null,
    }

    // Generate PDF
    const pdfBase64 = await buildEstampoPdf(finalText, headerData, officeImages)

    // Create Documento record
    const documento = await prisma.documento.create({
      data: {
        rolId: diligenciaWithRelations.rolId,
        diligenciaId: diligenciaWithRelations.id,
        nombre: `Estampo ${estampoBase.nombreVisible}`,
        tipo: 'Estampo',
        pdfId: pdfBase64,
        version: 1,
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        documento: {
          id: documento.id,
          nombre: documento.nombre,
          tipo: documento.tipo,
          pdfId: documento.pdfId,
          createdAt: documento.createdAt,
        },
      },
    })
  } catch (error) {
    console.error('Error generando estampo:', error)
    return NextResponse.json(
      { ok: false, error: 'Error al generar el estampo' },
      { status: 500 }
    )
  }
}

