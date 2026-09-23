import { and, eq, inArray, sql } from 'drizzle-orm'
import type { DbOrTx } from '../db/client'
import { assignments, duties, people, schedulePublications, scheduleMonths, services, slots } from '../db/schema'
import type { ChurchContext } from './context'

export type ScheduleMonth = typeof scheduleMonths.$inferSelect

export async function getOrCreateScheduleMonth(db: DbOrTx, churchId: string, month: string): Promise<ScheduleMonth> {
  await db.insert(scheduleMonths).values({ churchId, month }).onConflictDoNothing()
  const row = await db.query.scheduleMonths.findFirst({ where: and(eq(scheduleMonths.churchId, churchId), eq(scheduleMonths.month, month)) })
  return row!
}

// Foto da escala do mês, guardada a cada versão publicada ou alterada.
export async function scheduleSnapshot(db: DbOrTx, churchId: string, month: string) {
  const rows = await db.select({
    assignmentId: assignments.id,
    serviceId: services.id,
    startsAt: services.startsAt,
    serviceTitle: services.title,
    serviceStatus: services.status,
    slotId: slots.id,
    dutyId: duties.id,
    dutyName: duties.name,
    personId: people.id,
    personName: people.displayName,
    status: assignments.status,
    exceptional: assignments.exceptional,
  }).from(assignments)
    .innerJoin(slots, and(eq(slots.churchId, assignments.churchId), eq(slots.id, assignments.slotId)))
    .innerJoin(services, and(eq(services.churchId, slots.churchId), eq(services.id, slots.serviceId)))
    .innerJoin(duties, and(eq(duties.churchId, slots.churchId), eq(duties.id, slots.dutyId)))
    .innerJoin(people, and(eq(people.churchId, assignments.churchId), eq(people.id, assignments.personId)))
    .where(and(eq(assignments.churchId, churchId), eq(services.month, month)))
    .orderBy(services.startsAt, slots.position)
  return rows
}

export interface ChangeRecord {
  kind: 'change' | 'swap' | 'exception' | 'response'
  description: string
  // Designações cuja confirmação volta a pendente (tarefa mudou para a pessoa).
  resetAssignmentIds?: string[]
  justification?: string | null
  notifyNow?: boolean
}

// Toda alteração em mês já publicado gera nova versão com a foto completa da escala,
// guardando autor, data e — pela versão anterior — o estado antes da mudança.
// Em rascunho nada é versionado.
export async function recordScheduleChange(db: DbOrTx, ctx: ChurchContext, month: string, change: ChangeRecord): Promise<{ published: boolean, version: number }> {
  const sm = await getOrCreateScheduleMonth(db, ctx.church.id, month)
  if (change.resetAssignmentIds?.length) {
    await db.update(assignments).set({ status: 'pending', statusChangedAt: new Date(), updatedAt: new Date(), rowVersion: sql`${assignments.rowVersion} + 1` })
      .where(and(eq(assignments.churchId, ctx.church.id), inArray(assignments.id, change.resetAssignmentIds), sql`${assignments.status} <> 'pending'`))
  }
  if (sm.status !== 'published') return { published: false, version: sm.version }
  const [updated] = await db.update(scheduleMonths).set({ version: sql`${scheduleMonths.version} + 1` })
    .where(eq(scheduleMonths.id, sm.id)).returning()
  await db.insert(schedulePublications).values({
    churchId: ctx.church.id,
    scheduleMonthId: sm.id,
    version: updated!.version,
    kind: change.kind,
    publishedByAccountId: ctx.accountId,
    notifyNow: change.notifyNow ?? false,
    justification: change.justification ?? change.description,
    snapshot: await scheduleSnapshot(db, ctx.church.id, month),
  })
  return { published: true, version: updated!.version }
}

export async function currentScheduleVersion(db: DbOrTx, churchId: string, month: string): Promise<number> {
  const sm = await db.query.scheduleMonths.findFirst({ where: and(eq(scheduleMonths.churchId, churchId), eq(scheduleMonths.month, month)) })
  return sm?.version ?? 0
}
