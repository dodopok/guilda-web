import { and, asc, desc, eq, gte, inArray, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getConfig } from '../config'
import type { Db, DbOrTx } from '../db/client'
import {
  assignments,
  duties,
  ministries,
  people,
  qualifications,
  schedulePublications,
  scheduleMonths,
  services,
  slots,
  swapRequests,
  unavailabilities,
} from '../db/schema'
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors'
import { localParts, monthName } from '../lib/time'
import { firstName } from '../lib/text'
import { type Alert, computeAlerts } from './alerts'
import { audit } from './audit'
import { type ChurchContext, isCoordinator, requireCoordinator } from './context'
import { enqueueMessage } from './messaging/outbox'
import { arrivalFor, summarizeItems, syncReminderCorrections, type ReminderItem } from './reminders'
import { getOrCreateScheduleMonth, recordScheduleChange, scheduleSnapshot } from './schedule-changes'

// ---------------------------------------------------------------------------
// Leitura dos dados do mês
// ---------------------------------------------------------------------------

export async function loadMonth(db: DbOrTx, churchId: string, month: string) {
  const svcRows = await db.select().from(services).where(and(eq(services.churchId, churchId), eq(services.month, month))).orderBy(asc(services.startsAt))
  const serviceIds = svcRows.map((s) => s.id)
  const slotRows = serviceIds.length
    ? await db.select().from(slots).where(and(eq(slots.churchId, churchId), inArray(slots.serviceId, serviceIds))).orderBy(asc(slots.position))
    : []
  const slotIds = slotRows.map((s) => s.id)
  const asgRows = slotIds.length
    ? await db.select().from(assignments).where(and(eq(assignments.churchId, churchId), inArray(assignments.slotId, slotIds))).orderBy(asc(assignments.createdAt))
    : []
  const dutyRows = await db.select().from(duties).where(eq(duties.churchId, churchId)).orderBy(asc(duties.position), asc(duties.name))
  const personRows = await db.select().from(people).where(eq(people.churchId, churchId)).orderBy(asc(people.nameKey))
  const qualRows = await db.select({ personId: qualifications.personId, dutyId: qualifications.dutyId }).from(qualifications).where(eq(qualifications.churchId, churchId))
  const unavailRows = serviceIds.length
    ? await db.select().from(unavailabilities).where(and(eq(unavailabilities.churchId, churchId), inArray(unavailabilities.serviceId, serviceIds)))
    : []
  const sm = await db.query.scheduleMonths.findFirst({ where: and(eq(scheduleMonths.churchId, churchId), eq(scheduleMonths.month, month)) })
  return { services: svcRows, slots: slotRows, assignments: asgRows, duties: dutyRows, people: personRows, qualifications: qualRows, unavailabilities: unavailRows, scheduleMonth: sm ?? null }
}

export function alertsFor(data: Awaited<ReturnType<typeof loadMonth>>) {
  return computeAlerts({
    services: data.services,
    slots: data.slots,
    duties: data.duties,
    assignments: data.assignments,
    people: data.people,
    qualifications: data.qualifications,
    unavailabilities: data.unavailabilities,
    publishedAt: data.scheduleMonth?.publishedAt ?? null,
  })
}

// Visão completa do editor (somente coordenação).
export async function getScheduleEditor(db: Db, ctx: ChurchContext, month: string) {
  requireCoordinator(ctx)
  const data = await loadMonth(db, ctx.church.id, month)
  const { alerts, people: loads } = alertsFor(data)
  const ministryRows = await db.select().from(ministries).where(eq(ministries.churchId, ctx.church.id)).orderBy(asc(ministries.position))
  const tz = ctx.church.timezone
  const nameOf = new Map(data.people.map((p) => [p.id, p.displayName]))
  return {
    month,
    monthLabel: monthName(month),
    status: data.scheduleMonth?.status ?? 'draft',
    version: data.scheduleMonth?.version ?? 0,
    publishedAt: data.scheduleMonth?.publishedAt ?? null,
    services: data.services.map((s) => ({
      id: s.id,
      title: s.title,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      localDate: s.localDate,
      time: localParts(s.startsAt, tz).time,
      location: s.location,
      kind: s.kind,
      status: s.status,
      unavailablePersonIds: data.unavailabilities.filter((u) => u.serviceId === s.id).map((u) => u.personId),
      slots: data.slots.filter((sl) => sl.serviceId === s.id).map((sl) => ({
        id: sl.id,
        dutyId: sl.dutyId,
        requiredCount: sl.requiredCount,
        arrivalAt: arrivalFor(s.startsAt, sl.arrivalAt, data.duties.find((d) => d.id === sl.dutyId)?.arrivalMinutesBefore ?? null),
        startsAt: sl.startsAt,
        endsAt: sl.endsAt,
        note: sl.note,
        assignments: data.assignments.filter((a) => a.slotId === sl.id).map((a) => ({
          id: a.id,
          personId: a.personId,
          personName: nameOf.get(a.personId) ?? '',
          status: a.status,
          exceptional: a.exceptional,
          exceptionReason: a.exceptionReason,
        })),
      })),
    })),
    duties: data.duties.map((d) => ({ id: d.id, name: d.name, ministryId: d.ministryId, kind: d.kind, active: d.active })),
    ministries: ministryRows.map((m) => ({ id: m.id, name: m.name })),
    people: data.people.filter((p) => p.status === 'active').map((p) => ({
      id: p.id,
      displayName: p.displayName,
      roles: p.roles,
      dutyIds: data.qualifications.filter((q) => q.personId === p.id).map((q) => q.dutyId),
    })),
    alerts,
    loads,
  }
}

// ---------------------------------------------------------------------------
// Designações
// ---------------------------------------------------------------------------

export const assignSchema = z.object({
  personId: z.string().uuid(),
  // Pessoa sem habilitação para a função: exige motivo registrado.
  exceptionReason: z.string().trim().min(3).max(500).optional(),
  // Pessoa que informou indisponibilidade: exige justificativa explícita.
  overrideUnavailableReason: z.string().trim().min(3).max(500).optional(),
  notifyNow: z.boolean().default(false),
})

async function slotWithService(db: DbOrTx, churchId: string, slotId: string, lock = false) {
  const q = db.select({ slot: slots, service: services }).from(slots)
    .innerJoin(services, and(eq(services.churchId, slots.churchId), eq(services.id, slots.serviceId)))
    .where(and(eq(slots.churchId, churchId), eq(slots.id, slotId)))
  const rows = lock ? await q.for('update', { of: slots }) : await q
  const row = rows[0]
  if (!row) throw notFound('Posto')
  return row
}

export async function isQualified(db: DbOrTx, churchId: string, personId: string, dutyId: string) {
  const q = await db.query.qualifications.findFirst({ where: and(eq(qualifications.churchId, churchId), eq(qualifications.personId, personId), eq(qualifications.dutyId, dutyId)) })
  return Boolean(q)
}

export async function isUnavailable(db: DbOrTx, churchId: string, personId: string, serviceId: string) {
  const u = await db.query.unavailabilities.findFirst({ where: and(eq(unavailabilities.churchId, churchId), eq(unavailabilities.personId, personId), eq(unavailabilities.serviceId, serviceId)) })
  return Boolean(u)
}

export async function assignPerson(db: Db, ctx: ChurchContext, slotId: string, input: z.infer<typeof assignSchema>) {
  requireCoordinator(ctx)
  const result = await db.transaction(async (tx) => {
    // Trava o posto para que duas designações simultâneas não ultrapassem a quantidade.
    const { slot, service } = await slotWithService(tx, ctx.church.id, slotId, true)
    if (service.status !== 'scheduled') throw badRequest('service_cancelled', 'O culto está cancelado.')
    const person = await tx.query.people.findFirst({ where: and(eq(people.churchId, ctx.church.id), eq(people.id, input.personId)) })
    if (!person || person.status !== 'active') throw badRequest('invalid_person', 'Pessoa inexistente ou inativa nesta igreja.')
    const qualified = await isQualified(tx, ctx.church.id, person.id, slot.dutyId)
    if (!qualified && !input.exceptionReason) {
      throw conflict('not_qualified', `${person.displayName} não está habilitado(a) para esta função. Para uma designação excepcional, informe o motivo.`)
    }
    if (await isUnavailable(tx, ctx.church.id, person.id, service.id) && !input.overrideUnavailableReason) {
      throw conflict('person_unavailable', `${person.displayName} informou que não pode servir neste culto. Para escalar mesmo assim, registre a justificativa.`)
    }
    const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(assignments)
      .where(and(eq(assignments.slotId, slot.id), ne(assignments.status, 'declined')))
    if ((count?.n ?? 0) >= slot.requiredCount) {
      throw conflict('slot_full', 'Este posto já tem todas as pessoas necessárias. Aumente a quantidade do posto para incluir mais alguém.')
    }
    const [row] = await tx.insert(assignments).values({
      churchId: ctx.church.id,
      slotId: slot.id,
      personId: person.id,
      exceptional: !qualified,
      exceptionReason: !qualified ? input.exceptionReason ?? null : null,
      exceptionByAccountId: !qualified ? ctx.accountId : null,
      createdByAccountId: ctx.accountId,
    }).onConflictDoNothing({ target: [assignments.slotId, assignments.personId] }).returning()
    if (!row) throw conflict('already_assigned', `${person.displayName} já está neste posto.`)
    const reason = [input.exceptionReason && `Excepcional: ${input.exceptionReason}`, input.overrideUnavailableReason && `Apesar da indisponibilidade: ${input.overrideUnavailableReason}`].filter(Boolean).join(' · ') || null
    await audit(tx, {
      churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'assignment.created', entityType: 'assignment', entityId: row.id,
      data: { slotId: slot.id, personId: person.id, exceptional: !qualified }, reason,
    })
    const change = await recordScheduleChange(tx, ctx, service.month, {
      kind: qualified ? 'change' : 'exception',
      description: `${person.displayName} designado(a)`,
      justification: reason,
      notifyNow: input.notifyNow,
    })
    return { assignment: row, month: service.month, change }
  })
  await afterChange(db, ctx, result.month, result.change, input.notifyNow, [result.assignment.id])
  return result.assignment
}

export async function removeAssignment(db: Db, ctx: ChurchContext, assignmentId: string, input: { reason?: string | null, notifyNow?: boolean }) {
  requireCoordinator(ctx)
  const result = await db.transaction(async (tx) => {
    const current = await tx.query.assignments.findFirst({ where: and(eq(assignments.churchId, ctx.church.id), eq(assignments.id, assignmentId)) })
    if (!current) throw notFound('Designação')
    const { service } = await slotWithService(tx, ctx.church.id, current.slotId)
    await tx.delete(assignments).where(eq(assignments.id, current.id))
    await audit(tx, {
      churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'assignment.removed', entityType: 'assignment', entityId: current.id,
      data: { before: { slotId: current.slotId, personId: current.personId, status: current.status } }, reason: input.reason ?? null,
    })
    const change = await recordScheduleChange(tx, ctx, service.month, { kind: 'change', description: 'Designação removida', justification: input.reason, notifyNow: input.notifyNow })
    return { month: service.month, change, personId: current.personId }
  })
  await afterChange(db, ctx, result.month, result.change, input.notifyNow ?? false, [], [result.personId])
}

export const reassignSchema = z.object({
  personId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
  notifyNow: z.boolean().default(false),
})

// Designação excepcional pela coordenação: troca a pessoa de uma tarefa, inclusive por
// alguém fora da lista de habilitados, sempre com motivo registrado.
export async function reassign(db: Db, ctx: ChurchContext, assignmentId: string, input: z.infer<typeof reassignSchema>) {
  requireCoordinator(ctx)
  const result = await db.transaction(async (tx) => {
    const rows = await tx.select().from(assignments).where(and(eq(assignments.churchId, ctx.church.id), eq(assignments.id, assignmentId))).for('update')
    const current = rows[0]
    if (!current) throw notFound('Designação')
    const { slot, service } = await slotWithService(tx, ctx.church.id, current.slotId)
    const person = await tx.query.people.findFirst({ where: and(eq(people.churchId, ctx.church.id), eq(people.id, input.personId)) })
    if (!person || person.status !== 'active') throw badRequest('invalid_person', 'Pessoa inexistente ou inativa nesta igreja.')
    if (person.id === current.personId) throw badRequest('same_person', 'Escolha outra pessoa.')
    const qualified = await isQualified(tx, ctx.church.id, person.id, slot.dutyId)
    const [updated] = await tx.update(assignments).set({
      personId: person.id,
      status: 'pending',
      statusChangedAt: new Date(),
      exceptional: !qualified,
      exceptionReason: !qualified ? input.reason : null,
      exceptionByAccountId: !qualified ? ctx.accountId : null,
      rowVersion: sql`${assignments.rowVersion} + 1`,
      updatedAt: new Date(),
    }).where(eq(assignments.id, current.id)).returning().catch((err) => {
      if ((err as { cause?: { code?: string } }).cause?.code === '23505') throw conflict('already_assigned', `${person.displayName} já está neste posto.`)
      throw err
    })
    await tx.update(swapRequests).set({ status: 'superseded', respondedAt: new Date() })
      .where(and(eq(swapRequests.assignmentId, current.id), eq(swapRequests.status, 'proposed')))
    await audit(tx, {
      churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'assignment.reassigned', entityType: 'assignment', entityId: current.id,
      data: { before: { personId: current.personId, status: current.status }, after: { personId: person.id }, exceptional: !qualified }, reason: input.reason,
    })
    const change = await recordScheduleChange(tx, ctx, service.month, { kind: 'exception', description: `Designação excepcional: ${person.displayName}`, justification: input.reason, notifyNow: input.notifyNow })
    return { assignment: updated!, month: service.month, change, previousPersonId: current.personId }
  })
  await afterChange(db, ctx, result.month, result.change, input.notifyNow, [result.assignment.id], [result.previousPersonId])
  return result.assignment
}

async function afterChange(db: Db, ctx: ChurchContext, month: string, change: { published: boolean, version: number }, notifyNow: boolean, assignmentIds: string[], extraPersonIds: string[] = []) {
  if (!change.published) return
  await syncReminderCorrections(db, ctx.church)
  if (notifyNow) await notifyScheduleChange(db, ctx, month, change.version, assignmentIds, extraPersonIds)
}

// ---------------------------------------------------------------------------
// Publicação e avisos
// ---------------------------------------------------------------------------

export const publishSchema = z.object({
  notifyNow: z.boolean(),
  justification: z.string().trim().max(1000).nullable().optional(),
})

export async function publishMonth(db: Db, ctx: ChurchContext, month: string, input: z.infer<typeof publishSchema>) {
  requireCoordinator(ctx)
  const result = await db.transaction(async (tx) => {
    const sm = await getOrCreateScheduleMonth(tx, ctx.church.id, month)
    await tx.select().from(scheduleMonths).where(eq(scheduleMonths.id, sm.id)).for('update')
    const data = await loadMonth(tx, ctx.church.id, month)
    if (!data.services.length) throw badRequest('no_services', 'Cadastre os cultos do mês antes de publicar.')
    const { alerts } = alertsFor(data)
    const [updated] = await tx.update(scheduleMonths).set({
      status: 'published',
      version: sql`${scheduleMonths.version} + 1`,
      publishedAt: new Date(),
      publishedByAccountId: ctx.accountId,
    }).where(eq(scheduleMonths.id, sm.id)).returning()
    await tx.insert(schedulePublications).values({
      churchId: ctx.church.id,
      scheduleMonthId: sm.id,
      version: updated!.version,
      kind: 'publish',
      publishedByAccountId: ctx.accountId,
      notifyNow: input.notifyNow,
      justification: input.justification ?? null,
      alerts,
      snapshot: await scheduleSnapshot(tx, ctx.church.id, month),
    })
    await audit(tx, {
      churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'schedule.published', entityType: 'schedule_month', entityId: sm.id,
      data: { month, version: updated!.version, notifyNow: input.notifyNow, alertCount: alerts.length }, reason: input.justification ?? null,
    })
    return { scheduleMonth: updated!, alerts }
  })
  let notified = { queued: 0, blocked: 0 }
  if (input.notifyNow) notified = await notifyPublication(db, ctx, month, result.scheduleMonth.id, result.scheduleMonth.version)
  // Mês publicado depois de um lembrete que cobre estes cultos: as pessoas recebem agora.
  await syncReminderCorrections(db, ctx.church)
  return { version: result.scheduleMonth.version, alerts: result.alerts, notified }
}

async function personTasksInMonth(db: DbOrTx, ctx: ChurchContext, month: string, personIds?: string[]) {
  const rows = await db.select({
    assignmentId: assignments.id,
    personId: assignments.personId,
    serviceId: services.id,
    startsAt: services.startsAt,
    serviceTitle: services.title,
    location: services.location,
    dutyName: duties.name,
    slotArrival: slots.arrivalAt,
    arrivalMinutesBefore: duties.arrivalMinutesBefore,
  }).from(assignments)
    .innerJoin(slots, and(eq(slots.churchId, assignments.churchId), eq(slots.id, assignments.slotId)))
    .innerJoin(services, and(eq(services.churchId, slots.churchId), eq(services.id, slots.serviceId)))
    .innerJoin(duties, and(eq(duties.churchId, slots.churchId), eq(duties.id, slots.dutyId)))
    .where(and(
      eq(assignments.churchId, ctx.church.id), eq(services.month, month), eq(services.status, 'scheduled'), ne(assignments.status, 'declined'),
      personIds?.length ? inArray(assignments.personId, personIds) : undefined,
    ))
    .orderBy(asc(services.startsAt), asc(slots.position))
  const byPerson = new Map<string, ReminderItem[]>()
  for (const r of rows) {
    const arrival = arrivalFor(r.startsAt, r.slotArrival, r.arrivalMinutesBefore)
    byPerson.set(r.personId, [...(byPerson.get(r.personId) ?? []), {
      assignmentId: r.assignmentId, serviceId: r.serviceId, startsAt: r.startsAt.toISOString(), serviceTitle: r.serviceTitle,
      location: r.location, dutyName: r.dutyName, arrivalAt: arrival?.toISOString() ?? null,
    }])
  }
  return byPerson
}

async function notifyPublication(db: Db, ctx: ChurchContext, month: string, scheduleMonthId: string, version: number) {
  const byPerson = await personTasksInMonth(db, ctx, month)
  const names = await db.select({ id: people.id, name: people.displayName }).from(people).where(eq(people.churchId, ctx.church.id))
  const nameOf = new Map(names.map((n) => [n.id, n.name]))
  let queued = 0
  let blocked = 0
  for (const [personId, items] of byPerson) {
    const msg = await enqueueMessage(db, {
      churchId: ctx.church.id,
      personId,
      kind: 'schedule_published',
      idempotencyKey: `publish:${scheduleMonthId}:v${version}:${personId}`,
      params: [firstName(nameOf.get(personId) ?? ''), monthName(month), ctx.church.name, summarizeItems(items, ctx.church.timezone), `${getConfig().appBaseUrl}/i/${ctx.church.slug}/tarefas`],
    })
    if (msg.status === 'blocked') blocked++
    else queued++
  }
  return { queued, blocked }
}

// Aviso imediato, escolhido pela coordenação, às pessoas afetadas por uma alteração.
export async function notifyScheduleChange(db: Db, ctx: ChurchContext, month: string, version: number, assignmentIds: string[], extraPersonIds: string[] = []) {
  const affected = new Set(extraPersonIds)
  if (assignmentIds.length) {
    const rows = await db.select({ personId: assignments.personId }).from(assignments).where(and(eq(assignments.churchId, ctx.church.id), inArray(assignments.id, assignmentIds)))
    for (const r of rows) affected.add(r.personId)
  }
  if (!affected.size) return
  const byPerson = await personTasksInMonth(db, ctx, month, [...affected])
  const sm = await getOrCreateScheduleMonth(db, ctx.church.id, month)
  for (const personId of affected) {
    const person = await db.query.people.findFirst({ where: and(eq(people.churchId, ctx.church.id), eq(people.id, personId)) })
    await enqueueMessage(db, {
      churchId: ctx.church.id,
      personId,
      kind: 'schedule_change',
      idempotencyKey: `change:${sm.id}:v${version}:${personId}`,
      params: [firstName(person?.displayName ?? ''), monthName(month), ctx.church.name, summarizeItems(byPerson.get(personId) ?? [], ctx.church.timezone), `${getConfig().appBaseUrl}/i/${ctx.church.slug}/tarefas`],
    })
  }
}

export async function scheduleHistory(db: Db, ctx: ChurchContext, month: string) {
  requireCoordinator(ctx)
  const sm = await db.query.scheduleMonths.findFirst({ where: and(eq(scheduleMonths.churchId, ctx.church.id), eq(scheduleMonths.month, month)) })
  if (!sm) return []
  return db.select({
    version: schedulePublications.version,
    kind: schedulePublications.kind,
    notifyNow: schedulePublications.notifyNow,
    justification: schedulePublications.justification,
    createdAt: schedulePublications.createdAt,
    author: people.displayName,
    alertCount: sql<number>`jsonb_array_length(${schedulePublications.alerts})::int`,
    snapshot: schedulePublications.snapshot,
  }).from(schedulePublications)
    .leftJoin(people, and(eq(people.churchId, schedulePublications.churchId), eq(people.accountId, schedulePublications.publishedByAccountId)))
    .where(eq(schedulePublications.scheduleMonthId, sm.id))
    .orderBy(desc(schedulePublications.version))
}

// ---------------------------------------------------------------------------
// Visões do participante
// ---------------------------------------------------------------------------

// Escala publicada do mês (qualquer membro). Rascunho só aparece para a coordenação.
export async function getPublishedMonth(db: Db, ctx: ChurchContext, month: string) {
  const data = await loadMonth(db, ctx.church.id, month)
  const published = data.scheduleMonth?.status === 'published'
  if (!published && !isCoordinator(ctx)) {
    return { month, monthLabel: monthName(month), published: false, services: [] }
  }
  const nameOf = new Map(data.people.map((p) => [p.id, p.displayName]))
  const dutyOf = new Map(data.duties.map((d) => [d.id, d]))
  return {
    month,
    monthLabel: monthName(month),
    published,
    version: data.scheduleMonth?.version ?? 0,
    services: data.services.map((s) => ({
      id: s.id,
      title: s.title,
      startsAt: s.startsAt,
      localDate: s.localDate,
      time: localParts(s.startsAt, ctx.church.timezone).time,
      location: s.location,
      kind: s.kind,
      status: s.status,
      slots: data.slots.filter((sl) => sl.serviceId === s.id).map((sl) => ({
        id: sl.id,
        dutyName: dutyOf.get(sl.dutyId)?.name ?? '',
        arrivalAt: arrivalFor(s.startsAt, sl.arrivalAt, dutyOf.get(sl.dutyId)?.arrivalMinutesBefore ?? null),
        requiredCount: sl.requiredCount,
        people: data.assignments.filter((a) => a.slotId === sl.id).map((a) => ({
          assignmentId: a.id, personId: a.personId, name: nameOf.get(a.personId) ?? '', status: a.status,
        })),
      })),
    })),
  }
}

export async function myTasks(db: Db, ctx: ChurchContext, opts: { from?: Date } = {}) {
  if (!ctx.personId) throw forbidden()
  const from = opts.from ?? new Date(Date.now() - 12 * 3600_000)
  const rows = await db.select({
    assignment: assignments,
    service: services,
    slot: slots,
    duty: duties,
    ministryName: ministries.name,
  }).from(assignments)
    .innerJoin(slots, and(eq(slots.churchId, assignments.churchId), eq(slots.id, assignments.slotId)))
    .innerJoin(services, and(eq(services.churchId, slots.churchId), eq(services.id, slots.serviceId)))
    .innerJoin(duties, and(eq(duties.churchId, slots.churchId), eq(duties.id, slots.dutyId)))
    .innerJoin(ministries, and(eq(ministries.churchId, duties.churchId), eq(ministries.id, duties.ministryId)))
    .innerJoin(scheduleMonths, and(eq(scheduleMonths.churchId, services.churchId), eq(scheduleMonths.month, services.month)))
    .where(and(
      eq(assignments.churchId, ctx.church.id),
      eq(assignments.personId, ctx.personId),
      eq(scheduleMonths.status, 'published'),
      gte(services.startsAt, from),
    ))
    .orderBy(asc(services.startsAt), asc(slots.position))
  const assignmentIds = rows.map((r) => r.assignment.id)
  const swaps = assignmentIds.length
    ? await db.select({ swap: swapRequests, candidateName: people.displayName }).from(swapRequests)
        .innerJoin(people, and(eq(people.churchId, swapRequests.churchId), eq(people.id, swapRequests.candidatePersonId)))
        .where(and(eq(swapRequests.churchId, ctx.church.id), inArray(swapRequests.assignmentId, assignmentIds), eq(swapRequests.status, 'proposed')))
    : []
  const deadlineHours = ctx.church.confirmationDeadlineHours
  return rows.map((r) => ({
    assignmentId: r.assignment.id,
    status: r.assignment.status,
    rowVersion: r.assignment.rowVersion,
    service: {
      id: r.service.id,
      title: r.service.title,
      startsAt: r.service.startsAt,
      localDate: r.service.localDate,
      time: localParts(r.service.startsAt, ctx.church.timezone).time,
      location: r.service.location,
      status: r.service.status,
    },
    duty: { id: r.duty.id, name: r.duty.name, instructions: r.duty.instructions, ministry: r.ministryName, kind: r.duty.kind },
    arrivalAt: arrivalFor(r.service.startsAt, r.slot.arrivalAt, r.duty.arrivalMinutesBefore),
    note: r.slot.note,
    respondBy: new Date(r.service.startsAt.getTime() - deadlineHours * 3600_000),
    openSwaps: swaps.filter((s) => s.swap.assignmentId === r.assignment.id).map((s) => ({ id: s.swap.id, candidateName: s.candidateName, createdAt: s.swap.createdAt })),
  }))
}

export async function getAssignmentForMember(db: Db, ctx: ChurchContext, assignmentId: string) {
  const row = await db.query.assignments.findFirst({ where: and(eq(assignments.churchId, ctx.church.id), eq(assignments.id, assignmentId)) })
  if (!row) throw notFound('Tarefa')
  if (row.personId !== ctx.personId && !isCoordinator(ctx)) throw new AppError(404, 'not_found', 'Tarefa não encontrada.')
  return row
}

export type EditorAlert = Alert
