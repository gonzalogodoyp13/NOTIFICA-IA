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

async function ensureReplyFixtures(prismaClient: PrismaClient, officeId: number) {
  const mailboxAddress = 'qa-replies@example.local'
  const fixtures = Array.from({ length: 30 }, (_, index) => {
    const number = index + 1
    const matchStatus = number === 3 ? 'matched' : number % 4 === 0 ? 'needs_review' : 'unmatched'
    return {
      id: `qa-p9-reply-${String(number).padStart(3, '0')}`,
      officeId,
      provider: 'qa-fixture',
      mailboxAddress,
      providerMessageId: `<qa-p9-reply-${number}@example.local>`,
      senderEmail: `qa-remitente-${number}@example.local`,
      subject: qaName(`Respuesta ${number}`),
      textPreview: qaName(`Vista previa de respuesta ${number}`),
      bodyText: qaName(`Contenido controlado de respuesta ${number}`),
      receivedAt: new Date(Date.UTC(2026, 7, 24, 18, 0, 0) - index * 60_000),
      matchStatus,
      matchMethod: matchStatus === 'matched' ? 'tracking_token' : matchStatus === 'needs_review' ? 'sender_subject' : null,
      candidateRecipientIds: matchStatus === 'needs_review' ? [`qa-candidate-${number}`] : [],
    }
  })

  for (const fixture of fixtures) {
    await prismaClient.recibosDispatchReply.upsert({
      where: { id: fixture.id },
      update: fixture,
      create: fixture,
    })
  }

  const isolationOffice = await findOrCreate(
    () => prismaClient.office.findFirst({ where: { nombre: qaName('Reply Isolation Office') } }),
    () => prismaClient.office.create({ data: { nombre: qaName('Reply Isolation Office') } })
  )
  await prismaClient.recibosDispatchReply.upsert({
    where: { id: 'qa-p9-reply-second-office' },
    update: {
      officeId: isolationOffice.id,
      provider: 'qa-fixture',
      mailboxAddress,
      providerMessageId: '<qa-p9-reply-second-office@example.local>',
      senderEmail: 'qa-second-office@example.local',
      subject: qaName('Second Office Reply'),
      textPreview: qaName('This reply must remain office scoped'),
      bodyText: qaName('This reply must remain office scoped'),
      receivedAt: new Date('2026-08-24T19:00:00.000Z'),
      matchStatus: 'unmatched',
      matchMethod: null,
      candidateRecipientIds: [],
    },
    create: {
      id: 'qa-p9-reply-second-office',
      officeId: isolationOffice.id,
      provider: 'qa-fixture',
      mailboxAddress,
      providerMessageId: '<qa-p9-reply-second-office@example.local>',
      senderEmail: 'qa-second-office@example.local',
      subject: qaName('Second Office Reply'),
      textPreview: qaName('This reply must remain office scoped'),
      bodyText: qaName('This reply must remain office scoped'),
      receivedAt: new Date('2026-08-24T19:00:00.000Z'),
      matchStatus: 'unmatched',
      matchMethod: null,
      candidateRecipientIds: [],
    },
  })
}

async function ensurePhase4ReportFixtures(prismaClient: PrismaClient, officeId: number, userId: string) {
  await prismaClient.reportRecipientConfig.upsert({
    where: { officeId_userId: { officeId, userId } },
    create: { id: `qa-p4-recipient-${userId}`, officeId, userId, dailyEnabled: true, monthlyEnabled: true, customEnabled: true, isEnabled: true, createdByUserId: userId, updatedByUserId: userId },
    update: { dailyEnabled: true, monthlyEnabled: true, customEnabled: true, isEnabled: true, updatedByUserId: userId },
  })
  const now = new Date()
  const healthStates = ['disabled', 'healthy', 'running', 'attention', 'critical'] as const
  for (const state of healthStates) {
    const definitionId = `qa-p4-definition-${state}`
    await prismaClient.customReportDefinition.upsert({
      where: { id: definitionId },
      create: { id: definitionId, officeId, name: qaName(`Reporte ${state}`), description: `Fixture Phase 4: ${state}`, modules: ['reports'], actionCategories: ['CREATE', 'UPDATE', 'OTHER'], results: ['success', 'failure', 'denied'], actorUserIds: [], includeSystem: true, selectedColumns: ['timestamp', 'actor', 'module', 'eventType', 'result', 'description'], createdByUserId: userId, updatedByUserId: userId, recipients: { create: { userId } } },
      update: { status: 'ACTIVE', archivedAt: null, updatedByUserId: userId },
    })
    await prismaClient.reportSchedule.upsert({
      where: { officeId_identityKey: { officeId, identityKey: `custom:${definitionId}` } },
      create: { id: `qa-p4-schedule-${state}`, officeId, kind: 'CUSTOM', identityKey: `custom:${definitionId}`, customDefinitionId: definitionId, frequency: 'DAILY', localTime: '07:30', enabled: state !== 'disabled', latenessThresholdMinutes: 60,
        nextRunAt: state === 'critical' ? new Date(now.getTime() - 3 * 60 * 60_000) : state === 'disabled' ? null : new Date(now.getTime() + 60 * 60_000),
        lastAttemptAt: state === 'healthy' || state === 'running' ? new Date(now.getTime() - 30 * 60_000) : null,
        lastSuccessAt: state === 'healthy' ? new Date(now.getTime() - 30 * 60_000) : null,
        createdByUserId: userId, updatedByUserId: userId },
      update: { enabled: state !== 'disabled', nextRunAt: state === 'critical' ? new Date(now.getTime() - 3 * 60 * 60_000) : state === 'disabled' ? null : new Date(now.getTime() + 60 * 60_000), lastAttemptAt: state === 'healthy' || state === 'running' ? new Date(now.getTime() - 30 * 60_000) : null, lastSuccessAt: state === 'healthy' ? new Date(now.getTime() - 30 * 60_000) : null, consecutiveFailures: 0, safeLastError: null, updatedByUserId: userId },
    })
  }
  const jobStates = ['QUEUED', 'RUNNING', 'CANCEL_REQUESTED', 'SUCCEEDED', 'FAILED', 'CANCELLED'] as const
  for (const status of jobStates) {
    const id = `qa-p4-job-${status.toLowerCase()}`
    const running = status === 'RUNNING' || status === 'CANCEL_REQUESTED'
    const terminal = status === 'SUCCEEDED' || status === 'FAILED' || status === 'CANCELLED'
    await prismaClient.reportJob.upsert({
      where: { id },
      create: { id, officeId, type: status === 'QUEUED' ? 'DELIVER' : 'GENERATE', status, origin: 'MANUAL', reportKind: 'custom', customDefinitionId: 'qa-p4-definition-running', requestedByUserId: userId, idempotencyKey: `qa-p4:${status.toLowerCase()}`, requestedPeriodStart: new Date('2026-08-01T04:00:00.000Z'), requestedPeriodEnd: new Date('2026-08-02T03:59:59.999Z'), requestedPeriodLabel: '2026-08-01', payload: {}, progressPhase: status.toLowerCase(), completedUnits: status === 'SUCCEEDED' ? 1 : 0, totalUnits: 1, attemptCount: status === 'QUEUED' ? 0 : 1, claimedAt: running ? now : null, heartbeatAt: running ? now : null, leaseExpiresAt: running ? new Date(now.getTime() + 10 * 60_000) : null, completedAt: terminal ? now : null, safeError: status === 'FAILED' ? 'Fallo sintético seguro para aceptación QA.' : null },
      update: { status, progressPhase: status.toLowerCase(), claimedAt: running ? now : null, heartbeatAt: running ? now : null, leaseExpiresAt: running ? new Date(now.getTime() + 10 * 60_000) : null, completedAt: terminal ? now : null, safeError: status === 'FAILED' ? 'Fallo sintético seguro para aceptación QA.' : null },
    })
    if (status !== 'QUEUED') await prismaClient.reportJobRun.upsert({ where: { jobId_attemptNumber: { jobId: id, attemptNumber: 1 } }, create: { id: `${id}-run-1`, jobId: id, attemptNumber: 1, outcome: running ? 'RUNNING' : status === 'SUCCEEDED' ? 'SUCCEEDED' : status === 'CANCELLED' ? 'CANCELLED' : 'FAILED', startedAt: now, completedAt: terminal ? now : null, safeError: status === 'FAILED' ? 'Fallo sintético seguro para aceptación QA.' : null }, update: { outcome: running ? 'RUNNING' : status === 'SUCCEEDED' ? 'SUCCEEDED' : status === 'CANCELLED' ? 'CANCELLED' : 'FAILED', completedAt: terminal ? now : null } })
  }
  await prismaClient.reportSchedule.update({ where: { id: 'qa-p4-schedule-running' }, data: { lastJobId: 'qa-p4-job-running' } })
  const isolationOffice = await findOrCreate(
    () => prismaClient.office.findFirst({ where: { nombre: qaName('Reply Isolation Office') } }),
    () => prismaClient.office.create({ data: { nombre: qaName('Reply Isolation Office') } })
  )
  await prismaClient.reportJob.upsert({
    where: { id: 'qa-p4-job-second-office' },
    create: {
      id: 'qa-p4-job-second-office', officeId: isolationOffice.id, type: 'GENERATE', status: 'FAILED', origin: 'MANUAL', reportKind: 'daily',
      idempotencyKey: 'qa-p4:second-office', requestedPeriodStart: new Date('2026-08-01T04:00:00.000Z'), requestedPeriodEnd: new Date('2026-08-02T03:59:59.999Z'),
      requestedPeriodLabel: '2026-08-01', progressPhase: 'failed', attemptCount: 1, completedAt: now, safeError: 'Fallo sintético aislado.',
    },
    update: { officeId: isolationOffice.id, status: 'FAILED', progressPhase: 'failed', completedAt: now, safeError: 'Fallo sintético aislado.' },
  })
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
    const existingEstampo = await prismaClient.documento.findFirst({
      where: { notificacionId: notification.id, tipo: 'Estampo' },
    })
    if (!existingEstampo) {
      await prismaClient.documento.create({
        data: {
          rolId: role.id,
          diligenciaId: diligencia.id,
          notificacionId: notification.id,
          nombre: `${qaName('Seed Estampo')} ${label}`,
          tipo: 'Estampo',
          pdfId: `qa-p9-seeded-estampo-${label}`,
          estampoBaseId: catalog.wizardBase.id,
          generatedByUserId: catalog.user.id,
          generatedAt: new Date('2026-06-10T14:18:00.000Z'),
          sourceTemplate: qaMeta({ type: 'seed-estampo' }),
          generationVariables: qaMeta({ rol }),
        },
      })
    }
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
  await prismaClient.recibosDispatchReply.deleteMany({ where: { id: { startsWith: 'qa-p9-reply-' } } })
  const qaUser = await resolveQaUser(prismaClient)
  const reportStorageObjects = qaUser.officeId ? (await prismaClient.generatedReport.findMany({
    where: { officeId: qaUser.officeId },
    select: { versions: { select: { storageBucket: true, storageKey: true } } },
  })).flatMap(report => report.versions.map(version => ({ bucket: version.storageBucket, key: version.storageKey }))) : []
  if (qaUser.officeId) {
    await prismaClient.reportSchedule.updateMany({ where: { officeId: qaUser.officeId }, data: { lastJobId: null } })
    await prismaClient.reportJob.deleteMany({ where: { officeId: qaUser.officeId } })
    await prismaClient.reportDeliveryAttempt.deleteMany({ where: { officeId: qaUser.officeId } })
    await prismaClient.generatedReport.updateMany({ where: { officeId: qaUser.officeId }, data: { currentVersionId: null } })
    await prismaClient.generatedReport.deleteMany({ where: { officeId: qaUser.officeId } })
    await prismaClient.customReportDefinition.deleteMany({ where: { officeId: qaUser.officeId } })
    await prismaClient.reportSchedule.updateMany({ where: { officeId: qaUser.officeId }, data: {
      enabled: false, nextRunAt: null, lastAttemptAt: null, lastSuccessAt: null, lastFailureAt: null, consecutiveFailures: 0, safeLastError: null,
    } })
    await prismaClient.reportRecipientConfig.updateMany({
      where: { officeId: qaUser.officeId },
      data: { dailyEnabled: true, monthlyEnabled: true, customEnabled: false, isEnabled: true },
    })
    await prismaClient.office.update({ where: { id: qaUser.officeId }, data: { reportConfigRevision: 1 } })
  }
  await prismaClient.reportJob.deleteMany({ where: { id: { startsWith: 'qa-p4-job-' } } })
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
  const storageObjects = [...reportStorageObjects, ...roles.flatMap(role =>
    role.documentos.flatMap(documento =>
      documento.versions.map(version => ({ bucket: version.storageBucket, key: version.storageKey }))
    )
  )]

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
  await prismaClient.office.deleteMany({ where: { nombre: qaName('Reply Isolation Office') } })
}

export async function seedQaData(prismaClient: PrismaClient) {
  const catalog = await seedCatalog(prismaClient)
  await ensurePhase4ReportFixtures(prismaClient, catalog.officeId, catalog.user.id)
  await ensureCase(prismaClient, catalog, 'UNPAID', { receipt: true })
  await ensureCase(prismaClient, catalog, 'PAID', { receipt: true, paid: true })
  await ensureCase(prismaClient, catalog, 'FAILED', { failed: true })
  await ensureCase(prismaClient, catalog, 'WIZARD')
  await ensureCase(prismaClient, catalog, 'CUSTOM')
  await ensureCase(prismaClient, catalog, 'EXPORT', { receipt: true, paid: true })
  await ensureCase(prismaClient, catalog, 'RECONFLICT', { receipt: true, paid: true, twoEjecutados: true })
  await ensureReplyFixtures(prismaClient, catalog.officeId)
  return findQaContext(prismaClient)
}

async function main() {
  const environment = process.env.NEXT_PUBLIC_ENVIRONMENT?.trim().toLowerCase()
  const allowedEnvironments = new Set(['local', 'test', 'qa'])
  if (!allowedEnvironments.has(environment ?? '') || process.env.QA_ALLOW_MUTATIONS !== 'true') {
    throw new Error('QA database mutations require NEXT_PUBLIC_ENVIRONMENT=local|test|qa and QA_ALLOW_MUTATIONS=true.')
  }

  const mode = process.argv[2] ?? 'seed'
  if (mode === 'reset') {
    await cleanupQaSeed(prisma)
    console.log('QA seed fixtures removed.')
    return
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
