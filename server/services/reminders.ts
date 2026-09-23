import { and, asc, desc, eq, gt, gte, inArray, lt, ne } from 'drizzle-orm'
import { getConfig } from '../config'
import type { Db, DbOrTx } from '../db/client'
import { assignments, churches, duties, outboundMessages, people, reminderDeliveries, reminderRuns, scheduleMonths, services, slots } from '../db/schema'
import { sha256 } from '../lib/crypto'
import { formatServiceDate, formatTime, localParts, nextWeeklyOccurrence, weeklyOccurrences } from '../lib/time'
import { firstName } from '../lib/text'
import type { ChurchContext, ChurchRow } from './context'
import { requireCoordinator } from './context'
import { enqueueMessage, getChannel, hasConsent } from './messaging/outbox'
import { channelReadiness } from './messaging/dispatch'
import { renderPreview } from './messaging/templates'

export interface ReminderItem {
  assignmentId: string
  serviceId: string
  startsAt: string
  serviceTitle: string
  location: string | null
  dutyName: string
  arrivalAt: string | null
}

export function arrivalFor(serviceStartsAt: Date, slotArrivalAt: Date | null, arrivalMinutesBefore: number | null): Date | null {
  if (slotArrivalAt) return slotArrivalAt
  if (arrivalMinutesBefore === null || arrivalMinutesBefore === undefined) return null
  return new Date(serviceStartsAt.getTime() - arrivalMinutesBefore * 60_000)
}

// Tarefas de escalas publicadas, em cultos ativos, entre from (inclusive) e to (exclusivo).
// Tarefas recusadas não entram: a pessoa já avisou que não fará.
export async function itemsInWindow(db: DbOrTx, churchId: string, from: Date, to: Date): Promise<Map<string, ReminderItem[]>> {
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
    position: slots.position,
  }).from(assignments)
    .innerJoin(slots, and(eq(slots.churchId, assignments.churchId), eq(slots.id, assignments.slotId)))
    .innerJoin(services, and(eq(services.churchId, slots.churchId), eq(services.id, slots.serviceId)))
    .innerJoin(duties, and(eq(duties.churchId, slots.churchId), eq(duties.id, slots.dutyId)))
    .innerJoin(scheduleMonths, and(eq(scheduleMonths.churchId, services.churchId), eq(scheduleMonths.month, services.month)))
    .where(and(
      eq(assignments.churchId, churchId),
      ne(assignments.status, 'declined'),
      eq(services.status, 'scheduled'),
      eq(scheduleMonths.status, 'published'),
      gte(services.startsAt, from),
      lt(services.startsAt, to),
    ))
    .orderBy(asc(services.startsAt), asc(slots.position), asc(duties.name))
  const byPerson = new Map<string, ReminderItem[]>()
  for (const r of rows) {
    const arrival = arrivalFor(r.startsAt, r.slotArrival, r.arrivalMinutesBefore)
    const item: ReminderItem = {
      assignmentId: r.assignmentId,
      serviceId: r.serviceId,
      startsAt: r.startsAt.toISOString(),
      serviceTitle: r.serviceTitle,
      location: r.location,
      dutyName: r.dutyName,
      arrivalAt: arrival ? arrival.toISOString() : null,
    }
    byPerson.set(r.personId, [...(byPerson.get(r.personId) ?? []), item])
  }
  return byPerson
}

export function itemsHash(items: ReminderItem[]): string {
  const canonical = items.map((i) => [i.assignmentId, i.serviceId, i.startsAt, i.serviceTitle, i.location, i.dutyName, i.arrivalAt])
  canonical.sort((a, b) => String(a[2]).localeCompare(String(b[2])) || String(a[0]).localeCompare(String(b[0])))
  return sha256(JSON.stringify(canonical))
}

// Resumo em uma linha (parâmetros de modelo não aceitam quebras de linha).
// Nunca inventa horário de chegada: sem horário definido, diz "chegada a combinar".
export function summarizeItems(items: ReminderItem[], timeZone: string): string {
  if (!items.length) return 'nenhuma tarefa neste período (a anterior foi retirada ou o culto foi cancelado)'
  const byService = new Map<string, ReminderItem[]>()
  for (const i of items) byService.set(i.serviceId, [...(byService.get(i.serviceId) ?? []), i])
  const parts: string[] = []
  for (const list of byService.values()) {
    const first = list[0]!
    const tasks = list.map((i) => {
      const arrival = i.arrivalAt ? `chegar ${formatTime(localParts(new Date(i.arrivalAt), timeZone).time)}` : 'chegada a combinar'
      return `${i.dutyName} (${arrival})`
    }).join(', ')
    const where = first.location ? `, ${first.location}` : ''
    parts.push(`${formatServiceDate(new Date(first.startsAt), timeZone)}, ${first.serviceTitle}${where}: ${tasks}`)
  }
  return parts.join('; ')
}

function appLink(church: ChurchRow, path = '') {
  return `${getConfig().appBaseUrl}/i/${church.slug}${path}`
}

// ---------------------------------------------------------------------------
// Execução semanal
// ---------------------------------------------------------------------------

// Cria (uma única vez) a execução do lembrete para o instante agendado mais recente,
// se ele caiu dentro da janela de tolerância. Chamado a cada ciclo do trabalhador.
export async function runDueReminders(db: Db, now = new Date()) {
  const catchupMs = getConfig().worker.reminderCatchupHours * 3600_000
  const list = await db.select().from(churches).where(and(eq(churches.reminderEnabled, true), eq(churches.status, 'active')))
  const results: { churchId: string, runId: string, created: boolean }[] = []
  for (const church of list) {
    const from = new Date(Math.max(now.getTime() - catchupMs, church.reminderConfigUpdatedAt.getTime()))
    const due = weeklyOccurrences(church.reminderWeekday, church.reminderTime, church.timezone, from, now)[0]
    if (!due) continue
    const run = await executeReminderRun(db, church, due, 'schedule')
    results.push({ churchId: church.id, runId: run.id, created: run.created })
  }
  return results
}

export async function executeReminderRun(db: Db, church: ChurchRow, scheduledFor: Date, trigger: 'schedule' | 'manual') {
  const windowEnd = new Date(scheduledFor.getTime() + church.reminderWindowDays * 86400_000)
  const inserted = await db.insert(reminderRuns).values({
    churchId: church.id,
    scheduledFor,
    windowStart: scheduledFor,
    windowEnd,
    trigger,
  }).onConflictDoNothing().returning()
  const run = inserted[0] ?? (await db.query.reminderRuns.findFirst({ where: and(eq(reminderRuns.churchId, church.id), eq(reminderRuns.scheduledFor, scheduledFor)) }))!
  if (run.status === 'done') return { id: run.id, created: false }

  // Idempotente: cada pessoa tem a entrega seq=1 e a mensagem com chave própria.
  const byPerson = await itemsInWindow(db, church.id, run.windowStart, run.windowEnd)
  const personRows = byPerson.size
    ? await db.select().from(people).where(and(eq(people.churchId, church.id), inArray(people.id, [...byPerson.keys()])))
    : []
  const nameOf = new Map(personRows.map((p) => [p.id, p.displayName]))
  let queued = 0
  let blocked = 0
  for (const [personId, items] of byPerson) {
    const delivery = await db.insert(reminderDeliveries).values({
      churchId: church.id, runId: run.id, personId, seq: 1, kind: 'reminder', items, itemsHash: itemsHash(items),
    }).onConflictDoNothing().returning()
    const msg = await enqueueMessage(db, {
      churchId: church.id,
      personId,
      kind: 'weekly_reminder',
      idempotencyKey: `reminder:${run.id}:${personId}`,
      params: [firstName(nameOf.get(personId) ?? ''), church.name, summarizeItems(items, church.timezone), appLink(church, '/tarefas')],
    })
    if (delivery[0]) await db.update(reminderDeliveries).set({ messageId: msg.id }).where(eq(reminderDeliveries.id, delivery[0].id))
    if (msg.status === 'blocked') blocked++
    else queued++
  }
  await db.update(reminderRuns).set({
    status: 'done',
    finishedAt: new Date(),
    stats: { recipients: byPerson.size, queued, blocked },
  }).where(eq(reminderRuns.id, run.id))
  return { id: run.id, created: Boolean(inserted[0]) }
}

// ---------------------------------------------------------------------------
// Correções após o lembrete
// ---------------------------------------------------------------------------

// Compara o que cada pessoa recebeu no último lembrete/correção com a escala atual
// (só cultos ainda futuros). Quem mudou recebe uma correção; quem não mudou, nada.
// A sequência única por (execução, pessoa, seq) impede correção duplicada mesmo com
// dois processos rodando ao mesmo tempo.
export async function syncReminderCorrections(db: Db, church: ChurchRow, now = new Date()) {
  const runs = await db.select().from(reminderRuns).where(and(
    eq(reminderRuns.churchId, church.id), eq(reminderRuns.status, 'done'), gt(reminderRuns.windowEnd, now),
  )).orderBy(desc(reminderRuns.scheduledFor))
  let corrections = 0
  for (const run of runs) {
    const from = new Date(Math.max(run.windowStart.getTime(), now.getTime()))
    const current = await itemsInWindow(db, church.id, from, run.windowEnd)
    const deliveries = await db.select().from(reminderDeliveries).where(eq(reminderDeliveries.runId, run.id)).orderBy(asc(reminderDeliveries.seq))
    const latest = new Map<string, typeof deliveries[number]>()
    for (const d of deliveries) latest.set(d.personId, d)
    const personIds = new Set([...latest.keys(), ...current.keys()])
    for (const personId of personIds) {
      const now_items = current.get(personId) ?? []
      const last = latest.get(personId)
      const lastFuture = ((last?.items ?? []) as ReminderItem[]).filter((i) => new Date(i.startsAt) >= from)
      if (!last && !now_items.length) continue
      if (itemsHash(lastFuture) === itemsHash(now_items)) continue
      const seq = (last?.seq ?? 0) + 1
      if (last && await onlySelfDeclines(db, church.id, personId, lastFuture, now_items)) {
        // A própria pessoa recusou: atualiza a referência sem mandar mensagem.
        await db.insert(reminderDeliveries).values({
          churchId: church.id, runId: run.id, personId, seq, kind: 'silent', items: now_items, itemsHash: itemsHash(now_items),
        }).onConflictDoNothing()
        continue
      }
      // Quem não tinha recebido nada nesta janela (escala publicada ou pessoa incluída
      // depois do disparo) recebe o lembrete normal; os demais, a correção.
      const isFirst = !last
      const inserted = await db.insert(reminderDeliveries).values({
        churchId: church.id, runId: run.id, personId, seq, kind: isFirst ? 'reminder' : 'correction', items: now_items, itemsHash: itemsHash(now_items),
      }).onConflictDoNothing().returning()
      if (!inserted[0]) continue
      const person = await db.query.people.findFirst({ where: and(eq(people.churchId, church.id), eq(people.id, personId)) })
      const msg = await enqueueMessage(db, {
        churchId: church.id,
        personId,
        kind: isFirst ? 'weekly_reminder' : 'reminder_correction',
        idempotencyKey: isFirst ? `reminder:${run.id}:${personId}` : `correction:${run.id}:${personId}:${seq}`,
        params: [firstName(person?.displayName ?? ''), church.name, summarizeItems(now_items, church.timezone), appLink(church, '/tarefas')],
      })
      await db.update(reminderDeliveries).set({ messageId: msg.id }).where(eq(reminderDeliveries.id, inserted[0].id))
      corrections++
    }
  }
  return { corrections }
}

async function onlySelfDeclines(db: Db, churchId: string, personId: string, before: ReminderItem[], after: ReminderItem[]) {
  const key = (i: ReminderItem) => JSON.stringify([i.assignmentId, i.serviceId, i.startsAt, i.serviceTitle, i.location, i.dutyName, i.arrivalAt])
  const beforeKeys = new Set(before.map(key))
  if (after.some((i) => !beforeKeys.has(key(i)))) return false
  const afterIds = new Set(after.map((i) => i.assignmentId))
  const removed = before.filter((i) => !afterIds.has(i.assignmentId)).map((i) => i.assignmentId)
  if (!removed.length) return false
  const rows = await db.select({ id: assignments.id }).from(assignments).where(and(
    eq(assignments.churchId, churchId), inArray(assignments.id, removed), eq(assignments.personId, personId), eq(assignments.status, 'declined'),
  ))
  return rows.length === removed.length
}

// ---------------------------------------------------------------------------
// Painel da coordenação
// ---------------------------------------------------------------------------

export async function reminderPreview(db: Db, ctx: ChurchContext, now = new Date()) {
  requireCoordinator(ctx)
  const church = ctx.church
  const next = nextWeeklyOccurrence(church.reminderWeekday, church.reminderTime, church.timezone, now)
  const windowEnd = new Date(next.getTime() + church.reminderWindowDays * 86400_000)
  const byPerson = await itemsInWindow(db, church.id, next, windowEnd)
  const channel = await getChannel(db, church.id)
  const personRows = byPerson.size
    ? await db.select().from(people).where(and(eq(people.churchId, church.id), inArray(people.id, [...byPerson.keys()])))
    : []
  const recipients = []
  for (const p of personRows) {
    const items = byPerson.get(p.id)!
    let pending: string | null = null
    if (!p.phoneE164) pending = 'no_phone'
    else if (!(await hasConsent(db, church.id, p.id))) pending = 'no_consent'
    recipients.push({
      personId: p.id,
      displayName: p.displayName,
      taskCount: items.length,
      pending,
      message: renderPreview('weekly_reminder', [firstName(p.displayName), church.name, summarizeItems(items, church.timezone), appLink(church, '/tarefas')]),
    })
  }
  recipients.sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR'))
  return {
    enabled: church.reminderEnabled,
    nextRunAt: next,
    windowStart: next,
    windowEnd,
    channel: channelReadiness(channel),
    recipients,
  }
}

export async function listReminderRuns(db: Db, ctx: ChurchContext) {
  requireCoordinator(ctx)
  const runs = await db.select().from(reminderRuns).where(eq(reminderRuns.churchId, ctx.church.id)).orderBy(desc(reminderRuns.scheduledFor)).limit(20)
  const result = []
  for (const run of runs) {
    const rows = await db.select({
      id: reminderDeliveries.id,
      personId: reminderDeliveries.personId,
      personName: people.displayName,
      seq: reminderDeliveries.seq,
      kind: reminderDeliveries.kind,
      createdAt: reminderDeliveries.createdAt,
      messageStatus: outboundMessages.status,
      blockedReason: outboundMessages.blockedReason,
      lastError: outboundMessages.lastError,
      messageId: outboundMessages.id,
    }).from(reminderDeliveries)
      .innerJoin(people, and(eq(people.churchId, reminderDeliveries.churchId), eq(people.id, reminderDeliveries.personId)))
      .leftJoin(outboundMessages, eq(outboundMessages.id, reminderDeliveries.messageId))
      .where(eq(reminderDeliveries.runId, run.id))
      .orderBy(asc(people.nameKey), asc(reminderDeliveries.seq))
    result.push({ ...run, deliveries: rows })
  }
  return result
}
