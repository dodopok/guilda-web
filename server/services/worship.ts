import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db/client'
import { assignments, duties, services, slots } from '../db/schema'
import { badRequest, notFound } from '../lib/errors'
import { daysInMonth, localParts, weekdayOfLocalDate, zonedInstant } from '../lib/time'
import { audit } from './audit'
import { type ChurchContext, requireCoordinator } from './context'
import { syncReminderCorrections } from './reminders'
import { recordScheduleChange } from './schedule-changes'

const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use AAAA-MM-DD.')
const timeField = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM.')
export const monthField = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use AAAA-MM.')

export const serviceInputSchema = z.object({
  date: dateField,
  time: timeField,
  durationMinutes: z.number().int().min(15).max(600).default(120),
  title: z.string().trim().min(2).max(120),
  location: z.string().trim().max(200).nullable().optional(),
  kind: z.enum(['regular', 'special', 'short']).default('regular'),
  notes: z.string().trim().max(2000).nullable().optional(),
  // Funções que viram postos. Sem lista: funções ativas marcadas "incluir por padrão".
  dutyIds: z.array(z.string().uuid()).optional(),
})

export const serviceUpdateSchema = z.object({
  date: dateField.optional(),
  time: timeField.optional(),
  durationMinutes: z.number().int().min(15).max(600).optional(),
  title: z.string().trim().min(2).max(120).optional(),
  location: z.string().trim().max(200).nullable().optional(),
  kind: z.enum(['regular', 'special', 'short']).optional(),
  status: z.enum(['scheduled', 'cancelled']).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  notifyNow: z.boolean().default(false),
})

export const slotInputSchema = z.object({
  dutyId: z.string().uuid(),
  requiredCount: z.number().int().min(1).max(50).optional(),
  arrivalTime: timeField.nullable().optional(),
  startTime: timeField.nullable().optional(),
  endTime: timeField.nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  position: z.number().int().min(0).max(1000).optional(),
})

async function defaultDuties(db: Db, churchId: string, dutyIds?: string[]) {
  if (dutyIds) {
    if (!dutyIds.length) return []
    const rows = await db.select().from(duties).where(and(eq(duties.churchId, churchId), inArray(duties.id, dutyIds)))
    if (rows.length !== new Set(dutyIds).size) throw badRequest('invalid_duty', 'Função inexistente nesta igreja.')
    return rows
  }
  return db.select().from(duties).where(and(eq(duties.churchId, churchId), eq(duties.active, true), eq(duties.includeByDefault, true)))
    .orderBy(asc(duties.position), asc(duties.name))
}

export async function createService(db: Db, ctx: ChurchContext, input: z.infer<typeof serviceInputSchema>) {
  requireCoordinator(ctx)
  const tz = ctx.church.timezone
  const startsAt = zonedInstant(input.date, input.time, tz)
  const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000)
  const dutyRows = await defaultDuties(db, ctx.church.id, input.dutyIds)
  return db.transaction(async (tx) => {
    const [service] = await tx.insert(services).values({
      churchId: ctx.church.id,
      startsAt,
      endsAt,
      localDate: input.date,
      month: input.date.slice(0, 7),
      title: input.title,
      location: input.location ?? ctx.church.defaultLocation ?? null,
      kind: input.kind,
      notes: input.notes ?? null,
    }).returning()
    if (dutyRows.length) {
      await tx.insert(slots).values(dutyRows.map((d, i) => ({
        churchId: ctx.church.id,
        serviceId: service!.id,
        dutyId: d.id,
        requiredCount: d.defaultRequiredCount,
        position: i,
      })))
    }
    await audit(tx, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'service.created', entityType: 'service', entityId: service!.id })
    return service!
  })
}

// Cria os cultos de todos os domingos do mês que ainda não têm culto nesse horário.
// Repetir a chamada não duplica cultos.
export async function createSundayServices(db: Db, ctx: ChurchContext, input: { month: string, time: string, title: string, durationMinutes: number }) {
  requireCoordinator(ctx)
  const existing = await db.select({ startsAt: services.startsAt }).from(services)
    .where(and(eq(services.churchId, ctx.church.id), eq(services.month, input.month)))
  const taken = new Set(existing.map((e) => e.startsAt.getTime()))
  const created = []
  for (const date of daysInMonth(input.month)) {
    if (weekdayOfLocalDate(date) !== 0) continue
    if (taken.has(zonedInstant(date, input.time, ctx.church.timezone).getTime())) continue
    created.push(await createService(db, ctx, { date, time: input.time, title: input.title, durationMinutes: input.durationMinutes, kind: 'regular' }))
  }
  return created
}

export async function updateService(db: Db, ctx: ChurchContext, serviceId: string, input: z.infer<typeof serviceUpdateSchema>) {
  requireCoordinator(ctx)
  const tz = ctx.church.timezone
  const result = await db.transaction(async (tx) => {
    const current = await tx.query.services.findFirst({ where: and(eq(services.churchId, ctx.church.id), eq(services.id, serviceId)) })
    if (!current) throw notFound('Culto')
    const cur = localParts(current.startsAt, tz)
    const date = input.date ?? cur.date
    const time = input.time ?? cur.time
    const duration = input.durationMinutes ?? Math.round((current.endsAt.getTime() - current.startsAt.getTime()) / 60_000)
    const startsAt = zonedInstant(date, time, tz)
    const endsAt = new Date(startsAt.getTime() + duration * 60_000)
    const month = date.slice(0, 7)
    const serviceAssignments = await tx.select({ id: assignments.id }).from(assignments)
      .innerJoin(slots, and(eq(slots.churchId, assignments.churchId), eq(slots.id, assignments.slotId)))
      .where(and(eq(slots.churchId, ctx.church.id), eq(slots.serviceId, serviceId)))
    if (month !== current.month && serviceAssignments.length) {
      throw badRequest('month_change_with_assignments', 'Retire as designações antes de mover o culto para outro mês.')
    }
    const [updated] = await tx.update(services).set({
      startsAt,
      endsAt,
      localDate: date,
      month,
      ...(input.title ? { title: input.title } : {}),
      ...(input.location !== undefined ? { location: input.location } : {}),
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    }).where(and(eq(services.churchId, ctx.church.id), eq(services.id, serviceId))).returning()

    // Mudança de horário, local ou cancelamento muda a tarefa para quem está escalado.
    const relevant = startsAt.getTime() !== current.startsAt.getTime()
      || (input.status !== undefined && input.status !== current.status)
      || (input.location !== undefined && input.location !== current.location)
    let change = null
    if (relevant && serviceAssignments.length) {
      change = await recordScheduleChange(tx, ctx, month, {
        kind: 'change',
        description: input.status === 'cancelled' ? `Culto ${current.title} cancelado` : `Culto ${current.title} alterado`,
        resetAssignmentIds: serviceAssignments.map((a) => a.id),
        notifyNow: input.notifyNow,
      })
    }
    await audit(tx, {
      churchId: ctx.church.id,
      actorAccountId: ctx.accountId,
      action: 'service.updated',
      entityType: 'service',
      entityId: serviceId,
      data: { before: { startsAt: current.startsAt, status: current.status, location: current.location, title: current.title }, after: { startsAt, status: updated!.status, location: updated!.location, title: updated!.title } },
    })
    return { service: updated!, change, affectedAssignmentIds: relevant ? serviceAssignments.map((a) => a.id) : [] }
  })
  if (result.change?.published) {
    await syncReminderCorrections(db, ctx.church)
    if (input.notifyNow) {
      const { notifyScheduleChange } = await import('./schedule')
      await notifyScheduleChange(db, ctx, result.service.month, result.change.version, result.affectedAssignmentIds)
    }
  }
  return result.service
}

// Culto sem designações pode ser apagado; com designações, deve ser cancelado.
export async function deleteService(db: Db, ctx: ChurchContext, serviceId: string) {
  requireCoordinator(ctx)
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(assignments)
    .innerJoin(slots, and(eq(slots.churchId, assignments.churchId), eq(slots.id, assignments.slotId)))
    .where(and(eq(slots.churchId, ctx.church.id), eq(slots.serviceId, serviceId)))
  if ((count?.n ?? 0) > 0) throw badRequest('service_has_assignments', 'Este culto já tem pessoas escaladas. Cancele o culto em vez de apagá-lo.')
  const res = await db.delete(services).where(and(eq(services.churchId, ctx.church.id), eq(services.id, serviceId))).returning({ id: services.id })
  if (!res.length) throw notFound('Culto')
  await audit(db, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'service.deleted', entityType: 'service', entityId: serviceId })
}

function slotTimes(date: string, tz: string, input: z.infer<typeof slotInputSchema>) {
  return {
    arrivalAt: input.arrivalTime ? zonedInstant(date, input.arrivalTime, tz) : input.arrivalTime === null ? null : undefined,
    startsAt: input.startTime ? zonedInstant(date, input.startTime, tz) : input.startTime === null ? null : undefined,
    endsAt: input.endTime ? zonedInstant(date, input.endTime, tz) : input.endTime === null ? null : undefined,
  }
}

export async function addSlot(db: Db, ctx: ChurchContext, serviceId: string, input: z.infer<typeof slotInputSchema>) {
  requireCoordinator(ctx)
  const service = await db.query.services.findFirst({ where: and(eq(services.churchId, ctx.church.id), eq(services.id, serviceId)) })
  if (!service) throw notFound('Culto')
  const duty = await db.query.duties.findFirst({ where: and(eq(duties.churchId, ctx.church.id), eq(duties.id, input.dutyId)) })
  if (!duty) throw badRequest('invalid_duty', 'Função inexistente nesta igreja.')
  const times = slotTimes(service.localDate, ctx.church.timezone, input)
  const [maxPos] = await db.select({ n: sql<number>`coalesce(max(position), -1)::int` }).from(slots).where(eq(slots.serviceId, serviceId))
  const [row] = await db.insert(slots).values({
    churchId: ctx.church.id,
    serviceId,
    dutyId: duty.id,
    requiredCount: input.requiredCount ?? duty.defaultRequiredCount,
    position: input.position ?? (maxPos?.n ?? -1) + 1,
    arrivalAt: times.arrivalAt ?? null,
    startsAt: times.startsAt ?? null,
    endsAt: times.endsAt ?? null,
    note: input.note ?? null,
  }).returning()
  await audit(db, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'slot.created', entityType: 'slot', entityId: row!.id })
  return row!
}

export async function updateSlot(db: Db, ctx: ChurchContext, slotId: string, input: Partial<z.infer<typeof slotInputSchema>>) {
  requireCoordinator(ctx)
  const result = await db.transaction(async (tx) => {
    const slot = await tx.query.slots.findFirst({ where: and(eq(slots.churchId, ctx.church.id), eq(slots.id, slotId)) })
    if (!slot) throw notFound('Posto')
    const service = await tx.query.services.findFirst({ where: and(eq(services.churchId, ctx.church.id), eq(services.id, slot.serviceId)) })
    const times = slotTimes(service!.localDate, ctx.church.timezone, input as z.infer<typeof slotInputSchema>)
    const [updated] = await tx.update(slots).set({
      ...(input.requiredCount ? { requiredCount: input.requiredCount } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      ...(times.arrivalAt !== undefined ? { arrivalAt: times.arrivalAt } : {}),
      ...(times.startsAt !== undefined ? { startsAt: times.startsAt } : {}),
      ...(times.endsAt !== undefined ? { endsAt: times.endsAt } : {}),
    }).where(and(eq(slots.churchId, ctx.church.id), eq(slots.id, slotId))).returning()
    const arrivalChanged = times.arrivalAt !== undefined && (times.arrivalAt?.getTime() ?? null) !== (slot.arrivalAt?.getTime() ?? null)
    let change = null
    if (arrivalChanged) {
      const affected = await tx.select({ id: assignments.id }).from(assignments).where(and(eq(assignments.churchId, ctx.church.id), eq(assignments.slotId, slotId)))
      if (affected.length) {
        change = await recordScheduleChange(tx, ctx, service!.month, {
          kind: 'change', description: 'Horário de chegada alterado', resetAssignmentIds: affected.map((a) => a.id),
        })
      }
    }
    return { slot: updated!, change }
  })
  if (result.change?.published) await syncReminderCorrections(db, ctx.church)
  return result.slot
}

export async function deleteSlot(db: Db, ctx: ChurchContext, slotId: string) {
  requireCoordinator(ctx)
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(assignments).where(and(eq(assignments.churchId, ctx.church.id), eq(assignments.slotId, slotId)))
  if ((count?.n ?? 0) > 0) throw badRequest('slot_has_assignments', 'Retire as pessoas deste posto antes de removê-lo.')
  const res = await db.delete(slots).where(and(eq(slots.churchId, ctx.church.id), eq(slots.id, slotId))).returning({ id: slots.id })
  if (!res.length) throw notFound('Posto')
}

export async function listServices(db: Db, ctx: ChurchContext, month: string) {
  const rows = await db.select().from(services).where(and(eq(services.churchId, ctx.church.id), eq(services.month, month))).orderBy(asc(services.startsAt))
  const slotRows = rows.length
    ? await db.select({ slot: slots, dutyName: duties.name, dutyKind: duties.kind }).from(slots)
      .innerJoin(duties, and(eq(duties.churchId, slots.churchId), eq(duties.id, slots.dutyId)))
      .where(and(eq(slots.churchId, ctx.church.id), inArray(slots.serviceId, rows.map((r) => r.id))))
      .orderBy(asc(slots.position))
    : []
  return rows.map((s) => ({
    ...s,
    time: localParts(s.startsAt, ctx.church.timezone).time,
    slots: slotRows.filter((r) => r.slot.serviceId === s.id).map((r) => ({ ...r.slot, dutyName: r.dutyName, dutyKind: r.dutyKind })),
  }))
}
