import { createClient } from '@supabase/supabase-js'
import type { Prisma, PrismaClient } from '@prisma/client'
import { PrismaClient as Client } from '@prisma/client'

import {
  QA_PREFIX,
  findQaContext,
  qaName,
  qaRol,
  resolveQaUser,
  seedEstampoBasesForQa,
} from './qa-support'

const prisma = new Client()

async function findOrCreate<T>(
  find: () => Promise<T | null>,
  create: () => Promise<T>,
  update?: (record: T) => Promise<T>
) {
  const existing = await find()
  if (existing) {
    return update ? update(existing) : existing
  }
  return create()
}

function qaMeta(extra: Record<string, unknown> = {}): Prisma.JsonObject {
  return {
    qa: QA_PREFIX,
    ...extra,
  }
}

async function seedCatalog(prismaClient: PrismaClient) {
  const user = await resolveQaUser(prismaClient)
  if (!user.officeId) throw new Error(`QA user ${user.email} does not have an officeId.`)

  await seedEstampoBasesForQa(prismaClient)

  const officeId = user.officeId
  const comuna = await findOrCreate(
    () => prismaClient.comuna.findFirst({ where: { officeId, nombre: qaName('Santiago') } }),
    () => prismaClient.comuna.create({ data: { officeId, nombre: qaName('Santiago'), region: 'Metropolitana' } })
  )
  const tribunal = await findOrCreate(
    () => prismaClient.tribunal.findFirst({ where: { officeId, nombre: qaName('Tribunal Civil') } }),
    () => prismaClient.tribunal.create({ data: { officeId, nombre: qaName('Tribunal Civil'), direccion: 'QA 123', comuna: comuna.nombre } })
  )
  const banco = await findOrCreate(
    () => prismaClient.banco.findFirst({ where: { officeId, nombre: qaName('Banco') } }),
    () => prismaClient.banco.create({ data: { officeId, nombre: qaName('Banco'), cuenta: 'QA-0001' } })
  )
  const abogado = await findOrCreate(
    () => prismaClient.abogado.findFirst({ where: { officeId, nombre: qaName('Abogado') } }),
    () => prismaClient.abogado.create({
      data: {
        officeId,
        nombre: qaName('Abogado'),
        rut: '11.111.111-1',
        direccion: 'Av. QA 100',
        comuna: comuna.nombre,
        email: 'qa-abogado@example.local',
      },
    })
  )
  const procurador = await findOrCreate(
    () => prismaClient.procurador.findFirst({ where: { officeId, nombre: qaName('Procurador') } }),
    () => prismaClient.procurador.create({
      data: {
        officeId,
        nombre: qaName('Procurador'),
        email: 'qa-procurador@example.local',
        telefono: '+56900000000',
      },
    })
  )
  const materia = await findOrCreate(
    () => prismaClient.materia.findFirst({ where: { officeId, nombre: qaName('Cobranza') } }),
    () => prismaClient.materia.create({ data: { officeId, nombre: qaName('Cobranza') } })
  )
  const diligenciaTipo = await findOrCreate(
    () => prismaClient.diligenciaTipo.findFirst({ where: { officeId, nombre: qaName('Notificacion') } }),
    () => prismaClient.diligenciaTipo.create({ data: { officeId, nombre: qaName('Notificacion'), descripcion: 'QA notification workflow' } })
  )
  const customEstampo = await findOrCreate(
    () => prismaClient.estampo.findFirst({ where: { officeId, nombre: qaName('Custom Estampo') } }),
    () => prismaClient.estampo.create({
      data: {
        officeId,
        nombre: qaName('Custom Estampo'),
        tipo: 'CUSTOM',
        fileUrl: 'qa-p9-custom-template',
        contenido: 'CERTIFICO QA: $nombre_ejecutado, ROL $rol, tribunal $tribunal, hora $hora_diligencia.',
      },
    }),
    record => prismaClient.estampo.update({
      where: { id: record.id },
      data: {
        activo: true,
        tipo: 'CUSTOM',
        contenido: 'CERTIFICO QA: $nombre_ejecutado, ROL $rol, tribunal $tribunal, hora $hora_diligencia.',
      },
    })
  )
  const wizardBase = await prismaClient.estampoBase.findFirst({ where: { isActive: true }, orderBy: { id: 'asc' } })
  if (!wizardBase) throw new Error('No active wizard estampo base exists after QA seed.')

  await prismaClient.abogadoBanco.upsert({
    where: { officeId_abogadoId_bancoId: { officeId, abogadoId: abogado.id, bancoId: banco.id } },
    update: {},
    create: { officeId, abogadoId: abogado.id, bancoId: banco.id },
  })
  await prismaClient.procuradorAbogado.upsert({
    where: { officeId_procuradorId_abogadoId: { officeId, procuradorId: procurador.id, abogadoId: abogado.id } },
    update: {},
    create: { officeId, procuradorId: procurador.id, abogadoId: abogado.id },
  })

  await findOrCreate(
    () => prismaClient.arancel.findFirst({ where: { officeId, bancoId: banco.id, abogadoId: abogado.id, estampoId: customEstampo.id } }),
    () => prismaClient.arancel.create({ data: { officeId, bancoId: banco.id, abogadoId: abogado.id, estampoId: customEstampo.id, monto: 25000 } }),
    record => prismaClient.arancel.update({ where: { id: record.id }, data: { monto: 25000, activo: true } })
  )
  await findOrCreate(
    () => prismaClient.arancel.findFirst({ where: { officeId, bancoId: banco.id, abogadoId: abogado.id, estampoBaseCategoria: wizardBase.categoria } }),
    () => prismaClient.arancel.create({
      data: { officeId, bancoId: banco.id, abogadoId: abogado.id, estampoBaseCategoria: wizardBase.categoria, monto: 30000 },
    }),
    record => prismaClient.arancel.update({ where: { id: record.id }, data: { monto: 30000, activo: true } })
  )

  return { user, officeId, comuna, tribunal, banco, abogado, procurador, materia, diligenciaTipo, customEstampo, wizardBase }
}

async function ensureCase(
  prismaClient: PrismaClient,
  catalog: Awaited<ReturnType<typeof seedCatalog>>,
  label: string,
  options: { paid?: boolean; failed?: boolean; receipt?: boolean; twoEjecutados?: boolean } = {}
) {
  const rol = qaRol(label)
  let demanda = await prismaClient.demanda.findUnique({
    where: { officeId_rol: { officeId: catalog.officeId, rol } },
    include: { roles: true, ejecutados: true },
  })

  if (!demanda) {
    demanda = await prismaClient.demanda.create({
      data: {
        officeId: catalog.officeId,
        userId: catalog.user.id,
        rol,
        caratula: `${qaName('Caratula')} ${label}`,
        cuantia: 125000,
        abogadoId: catalog.abogado.id,
        materiaId: catalog.materia.id,
        procuradorId: catalog.procurador.id,
        roles: {
          create: {
            id: `qa-p9-role-${label.toLowerCase()}`,
            officeId: catalog.officeId,
            rol,
            tribunalId: catalog.tribunal.id,
            estado: 'en_proceso',
          },
        },
        ejecutados: {
          create: [
            {
              nombre: `${qaName('Ejecutado')} ${label}`,
              rut: '22.222.222-2',
              direccion: 'Calle QA 456',
              comunaId: catalog.comuna.id,
            },
            ...(options.twoEjecutados
              ? [{
                  nombre: `${qaName('Ejecutado Dos')} ${label}`,
                  rut: '33.333.333-3',
                  direccion: 'Calle QA 789',
                  comunaId: catalog.comuna.id,
                }]
              : []),
          ],
        },
      },
      include: { roles: true, ejecutados: true },
    })
  }

  if (!demanda.roles) {
    demanda.roles = await prismaClient.rolCausa.create({
      data: {
        id: `qa-p9-role-${label.toLowerCase()}`,
        demandaId: demanda.id,
        officeId: catalog.officeId,
        rol,
        tribunalId: catalog.tribunal.id,
        estado: 'en_proceso',
      },
    })
  }

  const role = demanda.roles
  const ejecutado = demanda.ejecutados[0]
  if (!ejecutado) throw new Error(`QA case ${label} is missing ejecutado.`)

  let diligencia = await prismaClient.diligencia.findFirst({
    where: { rolId: role.id, meta: { path: ['qaScenario'], equals: label } },
  })
  if (!diligencia) {
    diligencia = await prismaClient.diligencia.create({
      data: {
        rolId: role.id,
        tipoId: catalog.diligenciaTipo.id,
        fecha: new Date('2026-06-10T14:00:00.000Z'),
        estado: options.failed ? 'fallida' : 'completada',
        estadoCobro: options.paid ? 'PAGADO' : 'NO_PAGADO',
        fechaPago: options.paid ? new Date('2026-06-11T14:00:00.000Z') : null,
        meta: qaMeta({
          qaScenario: label,
          fechaEjecucion: '2026-06-10T14:00:00.000Z',
          horaEjecucion: '14:00',
          resultado: options.failed ? 'FALLIDA' : 'POSITIVA',
          monto: 125000,
        }),
      },
    })
  }

  let notification = await prismaClient.notificacion.findFirst({
    where: { diligenciaId: diligencia.id, meta: { path: ['qaScenario'], equals: label } },
  })
  if (!notification) {
    notification = await prismaClient.notificacion.create({
      data: {
        id: `qa-p9-noti-${label.toLowerCase()}`,
        diligenciaId: diligencia.id,
        ejecutadoId: ejecutado.id,
        createdAt: new Date('2026-06-10T14:10:00.000Z'),
        updatedAt: new Date('2026-06-10T14:15:00.000Z'),
        meta: qaMeta({
          qaScenario: label,
          fechaEjecucion: '2026-06-10T14:00:00.000Z',
          horaEjecucion: '14:00',
          resultado: options.failed ? 'FALLIDA' : 'POSITIVA',
          ejecutadoId: ejecutado.id,
        }),
      },
    })
  }

  if (options.receipt) {
    const existing = await prismaClient.recibo.findFirst({ where: { rolId: role.id, notificacionId: notification.id } })
    if (!existing) {
      const documento = await prismaClient.documento.create({
        data: {
          rolId: role.id,
          diligenciaId: diligencia.id,
          notificacionId: notification.id,
          nombre: `${qaName('Seed Recibo')} ${label}`,
          tipo: 'Recibo',
          pdfId: `qa-p9-seeded-${label}`,
          generatedByUserId: catalog.user.id,
          generatedAt: new Date('2026-06-10T14:20:00.000Z'),
          sourceTemplate: qaMeta({ type: 'seed-recibo' }),
          generationVariables: qaMeta({ rol }),
        },
      })
      await prismaClient.recibo.create({
        data: {
          rolId: role.id,
          officeId: catalog.officeId,
          diligenciaId: diligencia.id,
          notificacionId: notification.id,
          documentoId: documento.id,
          numeroRecibo: `QA-${label}-001`,
          numeroReciboYear: 2026,
          numeroBoleta: options.paid ? `B-${label}-001` : null,
          monto: 25000,
          medio: options.paid ? 'TRANSFERENCIA' : 'PENDIENTE',
          ref: options.paid ? `QA-${label}-REF` : null,
          fechaEjecucion: new Date('2026-06-10T14:00:00.000Z'),
          fechaRecibo: new Date('2026-06-10T14:20:00.000Z'),
        },
      })
    }
  }
}

function storageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function cleanupQaSeed(prismaClient: PrismaClient) {
  const roles = await prismaClient.rolCausa.findMany({
    where: { rol: { startsWith: `${QA_PREFIX}-` } },
    select: {
      id: true,
      demandaId: true,
      diligencias: { select: { id: true } },
      documentos: {
        select: {
          id: true,
          versions: { select: { storageBucket: true, storageKey: true } },
        },
      },
    },
  })

  const roleIds = roles.map(role => role.id)
  const demandaIds = roles.map(role => role.demandaId).filter((id): id is string => !!id)
  const diligenciaIds = roles.flatMap(role => role.diligencias.map(diligencia => diligencia.id))
  const documentIds = roles.flatMap(role => role.documentos.map(documento => documento.id))
  const storageObjects = roles.flatMap(role =>
    role.documentos.flatMap(documento =>
      documento.versions.map(version => ({ bucket: version.storageBucket, key: version.storageKey }))
    )
  )

  const supabase = storageClient()
  if (supabase) {
    const byBucket = new Map<string, string[]>()
    for (const object of storageObjects) {
      const existing = byBucket.get(object.bucket) ?? []
      existing.push(object.key)
      byBucket.set(object.bucket, existing)
    }
    for (const [bucket, keys] of Array.from(byBucket.entries())) {
      if (keys.length) await supabase.storage.from(bucket).remove(keys)
    }
  }

  await prismaClient.recibo.deleteMany({
    where: {
      OR: [
        { rolId: { in: roleIds } },
        { diligenciaId: { in: diligenciaIds } },
        { documentoId: { in: documentIds } },
      ],
    },
  })
  await prismaClient.documento.deleteMany({ where: { id: { in: documentIds } } })
  await prismaClient.notificacion.deleteMany({ where: { diligenciaId: { in: diligenciaIds } } })
  await prismaClient.diligencia.deleteMany({ where: { id: { in: diligenciaIds } } })
  await prismaClient.nota.deleteMany({ where: { rolId: { in: roleIds } } })
  await prismaClient.rolCausa.deleteMany({ where: { id: { in: roleIds } } })
  await prismaClient.ejecutado.deleteMany({ where: { demandaId: { in: demandaIds } } })
  await prismaClient.demanda.deleteMany({ where: { id: { in: demandaIds } } })

  await prismaClient.arancel.deleteMany({
    where: {
      OR: [
        { estampo: { nombre: { startsWith: QA_PREFIX } } },
        { banco: { nombre: { startsWith: QA_PREFIX } } },
        { abogado: { nombre: { startsWith: QA_PREFIX } } },
      ],
    },
  })
  await prismaClient.estampo.deleteMany({ where: { nombre: { startsWith: QA_PREFIX } } })
  await prismaClient.diligenciaTipo.deleteMany({ where: { nombre: { startsWith: QA_PREFIX } } })
  await prismaClient.tribunal.deleteMany({ where: { nombre: { startsWith: QA_PREFIX } } })
  await prismaClient.procuradorAbogado.deleteMany({ where: { procurador: { nombre: { startsWith: QA_PREFIX } } } })
  await prismaClient.procurador.deleteMany({ where: { nombre: { startsWith: QA_PREFIX } } })
  await prismaClient.abogadoBanco.deleteMany({ where: { abogado: { nombre: { startsWith: QA_PREFIX } } } })
  await prismaClient.abogado.deleteMany({ where: { nombre: { startsWith: QA_PREFIX } } })
  await prismaClient.banco.deleteMany({ where: { nombre: { startsWith: QA_PREFIX } } })
  await prismaClient.materia.deleteMany({ where: { nombre: { startsWith: QA_PREFIX } } })
  await prismaClient.comuna.deleteMany({ where: { nombre: { startsWith: QA_PREFIX } } })
}

export async function seedQaData(prismaClient: PrismaClient) {
  const catalog = await seedCatalog(prismaClient)
  await ensureCase(prismaClient, catalog, 'UNPAID', { receipt: true })
  await ensureCase(prismaClient, catalog, 'PAID', { receipt: true, paid: true })
  await ensureCase(prismaClient, catalog, 'FAILED', { failed: true })
  await ensureCase(prismaClient, catalog, 'WIZARD')
  await ensureCase(prismaClient, catalog, 'CUSTOM')
  await ensureCase(prismaClient, catalog, 'EXPORT', { receipt: true, paid: true })
  await ensureCase(prismaClient, catalog, 'RECONFLICT', { receipt: true, paid: true, twoEjecutados: true })
  return findQaContext(prismaClient)
}

async function main() {
  const mode = process.argv[2] ?? 'seed'
  if (mode === 'reset') {
    await cleanupQaSeed(prisma)
  } else if (mode !== 'seed') {
    throw new Error(`Unknown QA seed mode: ${mode}`)
  }

  const result = await seedQaData(prisma)
  console.log(`QA seed ready for ${result.userEmail} in office ${result.officeId}.`)
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
