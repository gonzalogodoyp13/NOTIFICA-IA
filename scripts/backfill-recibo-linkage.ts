import { prisma } from '../lib/prisma'

function parseNumeroRecibo(documentoNombre?: string | null) {
  if (!documentoNombre) {
    return null
  }

  const trimmed = documentoNombre.trim()
  if (!trimmed.startsWith('Recibo ')) {
    return null
  }

  return trimmed.replace(/^Recibo\s+/, '').trim() || null
}

async function main() {
  const recibos = await prisma.recibo.findMany({
    where: {
      OR: [
        { documentoId: null },
        { numeroRecibo: null },
        { numeroBoleta: null },
      ],
    },
    orderBy: {
      createdAt: 'asc',
    },
  })

  let updatedCount = 0
  let skippedCount = 0

  for (const recibo of recibos) {
    const candidatos = await prisma.documento.findMany({
      where: {
        rolId: recibo.rolId,
        tipo: 'Recibo',
        createdAt: {
          gte: new Date(recibo.createdAt.getTime() - 10 * 60 * 1000),
          lte: new Date(recibo.createdAt.getTime() + 10 * 60 * 1000),
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: 5,
    })

    if (candidatos.length !== 1) {
      skippedCount += 1
      continue
    }

    const documento = candidatos[0]
    const nextNumeroRecibo = recibo.numeroRecibo ?? parseNumeroRecibo(documento.nombre)
    const nextNumeroBoleta = recibo.numeroBoleta ?? recibo.ref ?? null

    await prisma.recibo.update({
      where: { id: recibo.id },
      data: {
        documentoId: recibo.documentoId ?? documento.id,
        diligenciaId: recibo.diligenciaId ?? documento.diligenciaId ?? null,
        notificacionId: recibo.notificacionId ?? documento.notificacionId ?? null,
        numeroRecibo: nextNumeroRecibo,
        numeroBoleta: nextNumeroBoleta,
      },
    })

    updatedCount += 1
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        updatedCount,
        skippedCount,
      },
      null,
      2
    )
  )
}

main()
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
