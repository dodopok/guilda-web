import { and, asc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db/client'
import { duties, ministries, qualifications, slots } from '../db/schema'
import { badRequest, notFound } from '../lib/errors'
import { audit } from './audit'
import { type ChurchContext, requireCoordinator } from './context'

export const ministrySchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  position: z.number().int().min(0).max(1000).optional(),
})

export const DUTY_KINDS = ['general', 'sermon', 'reading', 'presiding', 'music'] as const

export const dutySchema = z.object({
  ministryId: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
  instructions: z.string().trim().max(4000).nullable().optional(),
  arrivalMinutesBefore: z.number().int().min(0).max(600).nullable().optional(),
  kind: z.enum(DUTY_KINDS).default('general'),
  receivesMusicNotice: z.boolean().default(false),
  defaultRequiredCount: z.number().int().min(1).max(50).default(1),
  includeByDefault: z.boolean().default(true),
  active: z.boolean().default(true),
  position: z.number().int().min(0).max(1000).optional(),
})

export async function listCatalog(db: Db, ctx: ChurchContext) {
  const ms = await db.select().from(ministries).where(eq(ministries.churchId, ctx.church.id)).orderBy(asc(ministries.position), asc(ministries.name))
  const ds = await db.select().from(duties).where(eq(duties.churchId, ctx.church.id)).orderBy(asc(duties.position), asc(duties.name))
  return {
    ministries: ms,
    duties: ds,
  }
}

export async function createMinistry(db: Db, ctx: ChurchContext, input: z.infer<typeof ministrySchema>) {
  requireCoordinator(ctx)
  const [row] = await db.insert(ministries).values({ churchId: ctx.church.id, name: input.name, description: input.description ?? null, position: input.position ?? 0 }).returning()
  await audit(db, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'ministry.created', entityType: 'ministry', entityId: row!.id })
  return row!
}

export async function updateMinistry(db: Db, ctx: ChurchContext, id: string, input: Partial<z.infer<typeof ministrySchema>>) {
  requireCoordinator(ctx)
  const [row] = await db.update(ministries).set(input).where(and(eq(ministries.churchId, ctx.church.id), eq(ministries.id, id))).returning()
  if (!row) throw notFound('Ministério')
  return row
}

export async function createDuty(db: Db, ctx: ChurchContext, input: z.infer<typeof dutySchema>) {
  requireCoordinator(ctx)
  const ministry = await db.query.ministries.findFirst({ where: and(eq(ministries.churchId, ctx.church.id), eq(ministries.id, input.ministryId)) })
  if (!ministry) throw badRequest('invalid_ministry', 'Ministério inexistente nesta igreja.')
  const [row] = await db.insert(duties).values({
    churchId: ctx.church.id,
    ministryId: input.ministryId,
    name: input.name,
    instructions: input.instructions ?? null,
    arrivalMinutesBefore: input.arrivalMinutesBefore ?? null,
    kind: input.kind,
    receivesMusicNotice: input.receivesMusicNotice,
    defaultRequiredCount: input.defaultRequiredCount,
    includeByDefault: input.includeByDefault,
    active: input.active,
    position: input.position ?? 0,
  }).returning()
  await audit(db, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'duty.created', entityType: 'duty', entityId: row!.id })
  return row!
}

export async function updateDuty(db: Db, ctx: ChurchContext, id: string, input: Partial<z.infer<typeof dutySchema>>) {
  requireCoordinator(ctx)
  if (input.ministryId) {
    const ministry = await db.query.ministries.findFirst({ where: and(eq(ministries.churchId, ctx.church.id), eq(ministries.id, input.ministryId)) })
    if (!ministry) throw badRequest('invalid_ministry', 'Ministério inexistente nesta igreja.')
  }
  const [row] = await db.update(duties).set(input).where(and(eq(duties.churchId, ctx.church.id), eq(duties.id, id))).returning()
  if (!row) throw notFound('Função')
  await audit(db, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'duty.updated', entityType: 'duty', entityId: id, data: { fields: Object.keys(input) } })
  return row
}

// Função com postos ou habilitações não é apagada: é desativada para manter o histórico.
export async function deleteDuty(db: Db, ctx: ChurchContext, id: string) {
  requireCoordinator(ctx)
  const [used] = await db.select({ n: sql<number>`count(*)::int` }).from(slots).where(and(eq(slots.churchId, ctx.church.id), eq(slots.dutyId, id)))
  if ((used?.n ?? 0) > 0) {
    await db.update(duties).set({ active: false }).where(and(eq(duties.churchId, ctx.church.id), eq(duties.id, id)))
    return { deleted: false, deactivated: true }
  }
  await db.delete(qualifications).where(and(eq(qualifications.churchId, ctx.church.id), eq(qualifications.dutyId, id)))
  const res = await db.delete(duties).where(and(eq(duties.churchId, ctx.church.id), eq(duties.id, id))).returning({ id: duties.id })
  if (!res.length) throw notFound('Função')
  return { deleted: true, deactivated: false }
}
