import { and, asc, desc, eq, gt, inArray, lt, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getConfig } from '../config'
import type { Db, DbOrTx } from '../db/client'
import { assignmentResponses, assignments, duties, outboundMessages, people, qualifications, scheduleMonths, services, slots, swapRequests, unavailabilities } from '../db/schema'
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors'
import { formatServiceDate } from '../lib/time'
import { firstName } from '../lib/text'
import { audit } from './audit'
import { type ChurchContext, isCoordinator, requireCoordinator, requirePerson } from './context'
import type { ChurchRow } from './context'
import { enqueueMessage } from './messaging/outbox'
import { syncReminderCorrections } from './reminders'
import { currentScheduleVersion, recordScheduleChange } from './schedule-changes'

async function lockAssignment(tx: DbOrTx, churchId: string, assignmentId: string) {
  const rows = await tx.select().from(assignments).where(and(eq(assignments.churchId, churchId), eq(assignments.id, assignmentId))).for('update')
  return rows[0]
}

async function assignmentContext(tx: DbOrTx, churchId: string, slotId: string) {
  const [row] = await tx.select({ slot: slots, service: services, duty: duties }).from(slots)
    .innerJoin(services, and(eq(services.churchId, slots.churchId), eq(services.id, slots.serviceId)))
    .innerJoin(duties, and(eq(duties.churchId, slots.churchId), eq(duties.id, slots.dutyId)))
    .where(and(eq(slots.churchId, churchId), eq(slots.id, slotId)))
  if (!row) throw notFound('Posto')
  const sm = await tx.query.scheduleMonths.findFirst({ where: and(eq(scheduleMonths.churchId, churchId), eq(scheduleMonths.month, row.service.month)) })
  return { ...row, published: sm?.status === 'published' }
}

// Avisa a coordenação (quem tem consentimento) sobre recusa ou troca concluída.
async function notifyCoordinators(db: DbOrTx, church: ChurchRow, key: string, text: string) {
  const coordinators = await db.select().from(people).where(and(
    eq(people.churchId, church.id), eq(people.status, 'active'), sql`'coordinator' = any(${people.roles})`,
  ))
  for (const c of coordinators) {
    await enqueueMessage(db, {
      churchId: church.id,
      personId: c.id,
      kind: 'coordination_alert',
      idempotencyKey: `coord:${key}:${c.id}`,
      params: [firstName(c.displayName), church.name, text, `${getConfig().appBaseUrl}/i/${church.slug}/coordenacao/pendencias`],
    })
  }
}

// ---------------------------------------------------------------------------
// Confirmação e recusa
// ---------------------------------------------------------------------------

export const respondSchema = z.object({
  decision: z.enum(['confirmed', 'declined']),
  note: z.string().trim().max(500).nullable().optional(),
  // Versão da tarefa que a pessoa estava vendo: se mudou, a resposta é recusada.
  rowVersion: z.number().int().positive().optional(),
})

export async function respondToAssignment(db: Db, ctx: ChurchContext, assignmentId: string, input: z.infer<typeof respondSchema>) {
  const result = await db.transaction(async (tx) => {
    const a = await lockAssignment(tx, ctx.church.id, assignmentId)
    if (!a) throw notFound('Tarefa')
    const onBehalf = a.personId !== ctx.personId
    if (onBehalf && !isCoordinator(ctx)) throw notFound('Tarefa')
    if (input.rowVersion !== undefined && input.rowVersion !== a.rowVersion) {
      throw conflict('stale_assignment', 'Esta tarefa mudou depois que você abriu a página. Confira os dados atualizados e responda de novo.')
    }
    const { service, duty, published } = await assignmentContext(tx, ctx.church.id, a.slotId)
    if (!published) throw notFound('Tarefa')
    if (service.startsAt < new Date()) throw badRequest('service_past', 'Este culto já aconteceu.')
    if (service.status !== 'scheduled') throw badRequest('service_cancelled', 'Este culto foi cancelado.')
    const [updated] = await tx.update(assignments).set({ status: input.decision, statusChangedAt: new Date(), updatedAt: new Date() })
      .where(eq(assignments.id, a.id)).returning()
    const [resp] = await tx.insert(assignmentResponses).values({
      churchId: ctx.church.id,
      assignmentId: a.id,
      personId: a.personId,
      decision: input.decision,
      channel: onBehalf ? 'coordination' : 'app',
      note: input.note ?? null,
      recordedByAccountId: ctx.accountId,
      scheduleVersion: await currentScheduleVersion(tx, ctx.church.id, service.month),
    }).returning()
    await audit(tx, {
      churchId: ctx.church.id, actorAccountId: ctx.accountId, action: `assignment.${input.decision}`, entityType: 'assignment', entityId: a.id,
      data: { before: a.status, channel: onBehalf ? 'coordination' : 'app' }, reason: input.note ?? null,
    })
    if (input.decision === 'declined' && a.status !== 'declined') {
      const person = await tx.query.people.findFirst({ where: and(eq(people.churchId, ctx.church.id), eq(people.id, a.personId)) })
      await notifyCoordinators(tx, ctx.church, `declined:${resp!.id}`, `${person?.displayName ?? 'Uma pessoa'} recusou ${duty.name} em ${formatServiceDate(service.startsAt, ctx.church.timezone)}`)
    }
    return updated!
  })
  // Recusa retira a tarefa do lembrete; a correção ignora recusas feitas pela própria pessoa.
  await syncReminderCorrections(db, ctx.church)
  return result
}

// ---------------------------------------------------------------------------
// Trocas
// ---------------------------------------------------------------------------

async function candidateProblems(tx: DbOrTx, churchId: string, candidateId: string, slot: typeof slots.$inferSelect, service: typeof services.$inferSelect) {
  const problems: string[] = []
  const qual = await tx.query.qualifications.findFirst({ where: and(eq(qualifications.churchId, churchId), eq(qualifications.personId, candidateId), eq(qualifications.dutyId, slot.dutyId)) })
  if (!qual) problems.push('not_qualified')
  const un = await tx.query.unavailabilities.findFirst({ where: and(eq(unavailabilities.churchId, churchId), eq(unavailabilities.personId, candidateId), eq(unavailabilities.serviceId, service.id)) })
  if (un) problems.push('unavailable')
  const inSlot = await tx.query.assignments.findFirst({ where: and(eq(assignments.slotId, slot.id), eq(assignments.personId, candidateId)) })
  if (inSlot) problems.push('already_in_slot')
  // Choque: tarefa do candidato em outro culto que se sobrepõe a este.
  const start = slot.startsAt ?? service.startsAt
  const end = slot.endsAt ?? service.endsAt
  const clash = await tx.select({ id: assignments.id }).from(assignments)
    .innerJoin(slots, and(eq(slots.churchId, assignments.churchId), eq(slots.id, assignments.slotId)))
    .innerJoin(services, and(eq(services.churchId, slots.churchId), eq(services.id, slots.serviceId)))
    .where(and(
      eq(assignments.churchId, churchId), eq(assignments.personId, candidateId), ne(assignments.status, 'declined'),
      ne(services.id, service.id), eq(services.status, 'scheduled'),
      lt(sql`coalesce(${slots.startsAt}, ${services.startsAt})`, end), gt(sql`coalesce(${slots.endsAt}, ${services.endsAt})`, start),
    )).limit(1)
  if (clash.length) problems.push('clash')
  return problems
}

const PROBLEM_TEXT: Record<string, string> = {
  not_qualified: 'não tem habilitação para esta função',
  unavailable: 'informou indisponibilidade para este culto',
  already_in_slot: 'já está neste posto',
  clash: 'tem outra tarefa no mesmo horário',
}

// Pessoas habilitadas para a mesma função, com a situação de cada uma.
export async function listSwapCandidates(db: Db, ctx: ChurchContext, assignmentId: string) {
  const a = await db.query.assignments.findFirst({ where: and(eq(assignments.churchId, ctx.church.id), eq(assignments.id, assignmentId)) })
  if (!a || (a.personId !== ctx.personId && !isCoordinator(ctx))) throw notFound('Tarefa')
  const { slot, service } = await assignmentContext(db, ctx.church.id, a.slotId)
  const qualified = await db.select({ id: people.id, displayName: people.displayName }).from(qualifications)
    .innerJoin(people, and(eq(people.churchId, qualifications.churchId), eq(people.id, qualifications.personId)))
    .where(and(eq(qualifications.churchId, ctx.church.id), eq(qualifications.dutyId, slot.dutyId), eq(people.status, 'active'), ne(people.id, a.personId)))
    .orderBy(asc(people.nameKey))
  const result = []
  for (const p of qualified) {
    const problems = await candidateProblems(db, ctx.church.id, p.id, slot, service)
    result.push({ personId: p.id, displayName: p.displayName, available: problems.length === 0, problems: problems.map((x) => PROBLEM_TEXT[x]) })
  }
  return result
}

export const proposeSwapSchema = z.object({
  candidatePersonId: z.string().uuid(),
  message: z.string().trim().max(300).nullable().optional(),
})

export async function proposeSwap(db: Db, ctx: ChurchContext, assignmentId: string, input: z.infer<typeof proposeSwapSchema>) {
  const me = requirePerson(ctx)
  return db.transaction(async (tx) => {
    const a = await lockAssignment(tx, ctx.church.id, assignmentId)
    if (!a || a.personId !== me) throw notFound('Tarefa')
    const { slot, service, duty, published } = await assignmentContext(tx, ctx.church.id, a.slotId)
    if (!published) throw notFound('Tarefa')
    if (service.startsAt < new Date()) throw badRequest('service_past', 'Este culto já aconteceu.')
    const candidate = await tx.query.people.findFirst({ where: and(eq(people.churchId, ctx.church.id), eq(people.id, input.candidatePersonId)) })
    if (!candidate || candidate.status !== 'active' || candidate.id === me) throw badRequest('invalid_candidate', 'Escolha outra pessoa desta igreja.')
    const problems = await candidateProblems(tx, ctx.church.id, candidate.id, slot, service)
    if (problems.length) {
      throw conflict(`candidate_${problems[0]}`, `${candidate.displayName} ${PROBLEM_TEXT[problems[0]!]}.`, { problems })
    }
    const [swap] = await tx.insert(swapRequests).values({
      churchId: ctx.church.id,
      assignmentId: a.id,
      fromPersonId: me,
      candidatePersonId: candidate.id,
      message: input.message ?? null,
    }).onConflictDoNothing().returning()
    if (!swap) throw conflict('swap_exists', `Você já pediu a ${candidate.displayName} para assumir esta tarefa.`)
    const from = await tx.query.people.findFirst({ where: and(eq(people.churchId, ctx.church.id), eq(people.id, me)) })
    const msg = await enqueueMessage(tx, {
      churchId: ctx.church.id,
      personId: candidate.id,
      kind: 'swap_invite',
      idempotencyKey: `swap:${swap.id}`,
      params: [firstName(candidate.displayName), from?.displayName ?? '', duty.name, formatServiceDate(service.startsAt, ctx.church.timezone), `${getConfig().appBaseUrl}/i/${ctx.church.slug}/trocas`],
    })
    await audit(tx, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'swap.proposed', entityType: 'swap', entityId: swap.id, data: { assignmentId: a.id, candidateId: candidate.id } })
    return { ...swap, messageStatus: msg.status }
  })
}

export async function cancelSwap(db: Db, ctx: ChurchContext, swapId: string) {
  const me = requirePerson(ctx)
  const [row] = await db.update(swapRequests).set({ status: 'cancelled', respondedAt: new Date() })
    .where(and(eq(swapRequests.churchId, ctx.church.id), eq(swapRequests.id, swapId), eq(swapRequests.fromPersonId, me), eq(swapRequests.status, 'proposed')))
    .returning()
  if (!row) throw notFound('Pedido de troca')
  return row
}

// O candidato responde. Aceitar efetiva a troca sem aprovação da coordenação, dentro de
// uma transação com a designação travada: se outra troca ou mudança chegou antes, esta
// é recusada, e nunca ficam dois responsáveis finais para a mesma vaga.
export async function respondToSwap(db: Db, ctx: ChurchContext, swapId: string, accept: boolean) {
  const me = requirePerson(ctx)
  const result = await db.transaction(async (tx) => {
    const swaps = await tx.select().from(swapRequests).where(and(eq(swapRequests.churchId, ctx.church.id), eq(swapRequests.id, swapId))).for('update')
    const swap = swaps[0]
    if (!swap || swap.candidatePersonId !== me) throw notFound('Pedido de troca')
    if (swap.status !== 'proposed') throw conflict('swap_closed', 'Este pedido já foi respondido ou cancelado.')
    if (!accept) {
      const [row] = await tx.update(swapRequests).set({ status: 'rejected', respondedAt: new Date() }).where(eq(swapRequests.id, swap.id)).returning()
      await audit(tx, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'swap.rejected', entityType: 'swap', entityId: swap.id })
      return { swap: row!, month: null, change: null }
    }
    const a = await lockAssignment(tx, ctx.church.id, swap.assignmentId)
    if (!a || a.personId !== swap.fromPersonId) {
      await tx.update(swapRequests).set({ status: 'superseded', respondedAt: new Date() }).where(eq(swapRequests.id, swap.id))
      throw conflict('swap_stale', 'A tarefa já foi assumida por outra pessoa ou mudou. Nada foi alterado.')
    }
    const { slot, service, duty } = await assignmentContext(tx, ctx.church.id, a.slotId)
    if (service.startsAt < new Date() || service.status !== 'scheduled') throw badRequest('service_past', 'Este culto já aconteceu ou foi cancelado.')
    const problems = await candidateProblems(tx, ctx.church.id, me, slot, service)
    if (problems.length) throw conflict(`candidate_${problems[0]}`, `Não é possível aceitar: você ${PROBLEM_TEXT[problems[0]!]}.`, { problems })
    const [updated] = await tx.update(assignments).set({
      personId: me,
      status: 'confirmed',
      statusChangedAt: new Date(),
      exceptional: false,
      exceptionReason: null,
      rowVersion: sql`${assignments.rowVersion} + 1`,
      updatedAt: new Date(),
    }).where(eq(assignments.id, a.id)).returning()
    const [row] = await tx.update(swapRequests).set({ status: 'accepted', respondedAt: new Date() }).where(eq(swapRequests.id, swap.id)).returning()
    await tx.update(swapRequests).set({ status: 'superseded', respondedAt: new Date() })
      .where(and(eq(swapRequests.assignmentId, a.id), eq(swapRequests.status, 'proposed')))
    await tx.insert(assignmentResponses).values({
      churchId: ctx.church.id, assignmentId: a.id, personId: me, decision: 'confirmed', channel: 'app', note: 'Aceitou a troca',
      recordedByAccountId: ctx.accountId, scheduleVersion: await currentScheduleVersion(tx, ctx.church.id, service.month),
    })
    const [fromP, toP] = await Promise.all([
      tx.query.people.findFirst({ where: and(eq(people.churchId, ctx.church.id), eq(people.id, swap.fromPersonId)) }),
      tx.query.people.findFirst({ where: and(eq(people.churchId, ctx.church.id), eq(people.id, me)) }),
    ])
    const change = await recordScheduleChange(tx, ctx, service.month, { kind: 'swap', description: `Troca: ${fromP?.displayName} → ${toP?.displayName} (${duty.name})` })
    await audit(tx, {
      churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'swap.accepted', entityType: 'assignment', entityId: a.id,
      data: { before: { personId: swap.fromPersonId, status: a.status }, after: { personId: me, status: 'confirmed' }, swapId: swap.id },
    })
    await notifyCoordinators(tx, ctx.church, `swap:${swap.id}`, `troca concluída: ${toP?.displayName} assumiu ${duty.name} de ${fromP?.displayName} em ${formatServiceDate(service.startsAt, ctx.church.timezone)}`)
    return { swap: row!, assignment: updated!, month: service.month, change }
  })
  if (result.change?.published) await syncReminderCorrections(db, ctx.church)
  return result.swap
}

// Pedidos de troca que envolvem a pessoa (recebidos e enviados).
export async function mySwaps(db: Db, ctx: ChurchContext) {
  const me = requirePerson(ctx)
  const fromPeople = sql`from_p.display_name`
  const rows = await db.execute<{
    id: string, status: string, message: string | null, created_at: Date, responded_at: Date | null,
    assignment_id: string, from_person_id: string, candidate_person_id: string, from_name: string, candidate_name: string,
    duty_name: string, service_title: string, starts_at: Date, location: string | null
  }>(sql`
    select sr.id, sr.status, sr.message, sr.created_at, sr.responded_at, sr.assignment_id, sr.from_person_id, sr.candidate_person_id,
      ${fromPeople} as from_name, cand_p.display_name as candidate_name, d.name as duty_name, s.title as service_title, s.starts_at, s.location
    from swap_requests sr
    join people from_p on from_p.church_id = sr.church_id and from_p.id = sr.from_person_id
    join people cand_p on cand_p.church_id = sr.church_id and cand_p.id = sr.candidate_person_id
    join assignments a on a.church_id = sr.church_id and a.id = sr.assignment_id
    join slots sl on sl.church_id = a.church_id and sl.id = a.slot_id
    join duties d on d.church_id = sl.church_id and d.id = sl.duty_id
    join services s on s.church_id = sl.church_id and s.id = sl.service_id
    where sr.church_id = ${ctx.church.id} and (sr.from_person_id = ${me} or sr.candidate_person_id = ${me})
      and s.starts_at > now() - interval '1 day'
    order by (sr.status = 'proposed') desc, sr.created_at desc
    limit 50`)
  return rows.rows.map((r) => ({
    id: r.id,
    status: r.status,
    message: r.message,
    createdAt: new Date(r.created_at),
    respondedAt: r.responded_at ? new Date(r.responded_at) : null,
    direction: r.candidate_person_id === me ? 'received' : 'sent',
    fromName: r.from_name,
    candidateName: r.candidate_name,
    dutyName: r.duty_name,
    serviceTitle: r.service_title,
    startsAt: new Date(r.starts_at),
    location: r.location,
  }))
}

// ---------------------------------------------------------------------------
// Painel de pendências da coordenação
// ---------------------------------------------------------------------------

export async function coordinationPending(db: Db, ctx: ChurchContext) {
  requireCoordinator(ctx)
  const now = new Date()
  const base = db.select({
    assignmentId: assignments.id,
    status: assignments.status,
    personId: people.id,
    personName: people.displayName,
    dutyName: duties.name,
    serviceId: services.id,
    serviceTitle: services.title,
    startsAt: services.startsAt,
    statusChangedAt: assignments.statusChangedAt,
  }).from(assignments)
    .innerJoin(people, and(eq(people.churchId, assignments.churchId), eq(people.id, assignments.personId)))
    .innerJoin(slots, and(eq(slots.churchId, assignments.churchId), eq(slots.id, assignments.slotId)))
    .innerJoin(services, and(eq(services.churchId, slots.churchId), eq(services.id, slots.serviceId)))
    .innerJoin(duties, and(eq(duties.churchId, slots.churchId), eq(duties.id, slots.dutyId)))
    .innerJoin(scheduleMonths, and(eq(scheduleMonths.churchId, services.churchId), eq(scheduleMonths.month, services.month)))
  const upcoming = and(eq(assignments.churchId, ctx.church.id), gt(services.startsAt, now), eq(services.status, 'scheduled'), eq(scheduleMonths.status, 'published'))
  const declined = await base.where(and(upcoming, eq(assignments.status, 'declined'))).orderBy(asc(services.startsAt))
  const deadline = new Date(now.getTime() + ctx.church.confirmationDeadlineHours * 3600_000)
  const overdue = await base.where(and(upcoming, eq(assignments.status, 'pending'), lt(services.startsAt, deadline))).orderBy(asc(services.startsAt))
  const [pendingCount] = await db.select({ n: sql<number>`count(*)::int` }).from(assignments)
    .innerJoin(slots, and(eq(slots.churchId, assignments.churchId), eq(slots.id, assignments.slotId)))
    .innerJoin(services, and(eq(services.churchId, slots.churchId), eq(services.id, slots.serviceId)))
    .innerJoin(scheduleMonths, and(eq(scheduleMonths.churchId, services.churchId), eq(scheduleMonths.month, services.month)))
    .where(and(upcoming, eq(assignments.status, 'pending')))
  const openSwaps = await db.execute<{ id: string, from_name: string, candidate_name: string, duty_name: string, starts_at: Date, created_at: Date }>(sql`
    select sr.id, fp.display_name as from_name, cp.display_name as candidate_name, d.name as duty_name, s.starts_at, sr.created_at
    from swap_requests sr
    join people fp on fp.church_id = sr.church_id and fp.id = sr.from_person_id
    join people cp on cp.church_id = sr.church_id and cp.id = sr.candidate_person_id
    join assignments a on a.church_id = sr.church_id and a.id = sr.assignment_id
    join slots sl on sl.church_id = a.church_id and sl.id = a.slot_id
    join duties d on d.church_id = sl.church_id and d.id = sl.duty_id
    join services s on s.church_id = sl.church_id and s.id = sl.service_id
    where sr.church_id = ${ctx.church.id} and sr.status = 'proposed' and s.starts_at > now()
    order by s.starts_at`)
  const recentSwaps = await db.execute<{ id: string, from_name: string, candidate_name: string, duty_name: string, starts_at: Date, responded_at: Date }>(sql`
    select sr.id, fp.display_name as from_name, cp.display_name as candidate_name, d.name as duty_name, s.starts_at, sr.responded_at
    from swap_requests sr
    join people fp on fp.church_id = sr.church_id and fp.id = sr.from_person_id
    join people cp on cp.church_id = sr.church_id and cp.id = sr.candidate_person_id
    join assignments a on a.church_id = sr.church_id and a.id = sr.assignment_id
    join slots sl on sl.church_id = a.church_id and sl.id = a.slot_id
    join duties d on d.church_id = sl.church_id and d.id = sl.duty_id
    join services s on s.church_id = sl.church_id and s.id = sl.service_id
    where sr.church_id = ${ctx.church.id} and sr.status = 'accepted' and sr.responded_at > now() - interval '14 days'
    order by sr.responded_at desc`)
  const [blocked] = await db.select({ n: sql<number>`count(*)::int` }).from(outboundMessages)
    .where(and(eq(outboundMessages.churchId, ctx.church.id), inArray(outboundMessages.status, ['blocked', 'failed', 'unknown']), gt(outboundMessages.createdAt, new Date(now.getTime() - 30 * 86400_000))))
  return {
    declined,
    overdue,
    pendingTotal: pendingCount?.n ?? 0,
    openSwaps: openSwaps.rows.map((r) => ({ id: r.id, fromName: r.from_name, candidateName: r.candidate_name, dutyName: r.duty_name, startsAt: new Date(r.starts_at), createdAt: new Date(r.created_at) })),
    recentSwaps: recentSwaps.rows.map((r) => ({ id: r.id, fromName: r.from_name, candidateName: r.candidate_name, dutyName: r.duty_name, startsAt: new Date(r.starts_at), respondedAt: new Date(r.responded_at) })),
    messageProblems: blocked?.n ?? 0,
  }
}

export async function assignmentHistory(db: Db, ctx: ChurchContext, assignmentId: string) {
  const a = await db.query.assignments.findFirst({ where: and(eq(assignments.churchId, ctx.church.id), eq(assignments.id, assignmentId)) })
  if (!a) throw notFound('Tarefa')
  if (a.personId !== ctx.personId && !isCoordinator(ctx)) throw new AppError(404, 'not_found', 'Tarefa não encontrada.')
  return db.select({
    decision: assignmentResponses.decision,
    channel: assignmentResponses.channel,
    note: assignmentResponses.note,
    createdAt: assignmentResponses.createdAt,
    personName: people.displayName,
    scheduleVersion: assignmentResponses.scheduleVersion,
  }).from(assignmentResponses)
    .innerJoin(people, and(eq(people.churchId, assignmentResponses.churchId), eq(people.id, assignmentResponses.personId)))
    .where(and(eq(assignmentResponses.churchId, ctx.church.id), eq(assignmentResponses.assignmentId, assignmentId)))
    .orderBy(desc(assignmentResponses.createdAt))
}
