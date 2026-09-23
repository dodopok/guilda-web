import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getConfig } from '../config'
import type { Db, DbOrTx } from '../db/client'
import { assignments, availabilityRequests, availabilityResponses, churches, consents, outboundMessages, people, qualifications, scheduleMonths, serviceScripts, services, slots, unavailabilities } from '../db/schema'
import { sha256 } from '../lib/crypto'
import { badRequest, notFound } from '../lib/errors'
import { formatDateShort, formatServiceDate, localParts, monthName } from '../lib/time'
import { firstName } from '../lib/text'
import { audit } from './audit'
import { type ChurchContext, type ChurchRow, isCoordinator, requireCoordinator, requirePerson } from './context'
import { enqueueMessage } from './messaging/outbox'
import { TEMPLATES } from './messaging/templates'

export const requestSchema = z.object({
  sendAt: z.coerce.date(),
  deadlineAt: z.coerce.date(),
})

async function getRequest(db: DbOrTx, churchId: string, month: string) {
  return db.query.availabilityRequests.findFirst({ where: and(eq(availabilityRequests.churchId, churchId), eq(availabilityRequests.month, month)) })
}

// Pessoas que podem ser escaladas (ativas e com alguma habilitação).
async function schedulablePeople(db: DbOrTx, churchId: string) {
  return db.selectDistinct({ id: people.id, displayName: people.displayName, nameKey: people.nameKey }).from(people)
    .innerJoin(qualifications, and(eq(qualifications.churchId, people.churchId), eq(qualifications.personId, people.id)))
    .where(and(eq(people.churchId, churchId), eq(people.status, 'active')))
    .orderBy(asc(people.nameKey))
}

// Agenda (ou reagenda) o pedido do mês. O envio pode ser antecipado para o fim do mês
// anterior quando o primeiro culto cai cedo: basta escolher a data de envio.
export async function scheduleRequest(db: Db, ctx: ChurchContext, month: string, input: z.infer<typeof requestSchema>) {
  requireCoordinator(ctx)
  if (input.deadlineAt <= input.sendAt) throw badRequest('invalid_deadline', 'O prazo precisa ser depois do envio.')
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(services)
    .where(and(eq(services.churchId, ctx.church.id), eq(services.month, month), eq(services.status, 'scheduled')))
  if (!count?.n) throw badRequest('no_services', 'Cadastre os cultos do mês antes de pedir as indisponibilidades.')
  const existing = await getRequest(db, ctx.church.id, month)
  if (existing && existing.status === 'sent') {
    // Depois de enviado, só o prazo pode mudar.
    const [row] = await db.update(availabilityRequests).set({ deadlineAt: input.deadlineAt }).where(eq(availabilityRequests.id, existing.id)).returning()
    return row!
  }
  const [row] = await db.insert(availabilityRequests).values({
    churchId: ctx.church.id,
    month,
    sendAt: input.sendAt,
    deadlineAt: input.deadlineAt,
    createdByAccountId: ctx.accountId,
  }).onConflictDoUpdate({
    target: [availabilityRequests.churchId, availabilityRequests.month],
    set: { sendAt: input.sendAt, deadlineAt: input.deadlineAt, status: 'scheduled' },
  }).returning()
  await audit(db, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'availability.scheduled', entityType: 'availability_request', entityId: row!.id, data: { month, sendAt: input.sendAt, deadlineAt: input.deadlineAt } })
  return row!
}

export async function cancelRequest(db: Db, ctx: ChurchContext, month: string) {
  requireCoordinator(ctx)
  const [row] = await db.update(availabilityRequests).set({ status: 'cancelled' })
    .where(and(eq(availabilityRequests.churchId, ctx.church.id), eq(availabilityRequests.month, month), eq(availabilityRequests.status, 'scheduled'))).returning()
  if (!row) throw badRequest('not_cancellable', 'Só é possível cancelar um pedido ainda não enviado.')
  return row
}

// Envia agora (antecipação manual) — usa o mesmo caminho idempotente do agendamento.
export async function sendRequestNow(db: Db, ctx: ChurchContext, month: string) {
  requireCoordinator(ctx)
  const req = await getRequest(db, ctx.church.id, month)
  if (!req || req.status === 'cancelled') throw notFound('Pedido de indisponibilidades')
  if (req.status === 'scheduled') {
    await db.update(availabilityRequests).set({ sendAt: new Date() }).where(eq(availabilityRequests.id, req.id))
  }
  return dispatchRequest(db, ctx.church, req.id)
}

// Chamado pelo trabalhador: envia pedidos cuja hora chegou e cujo prazo não passou.
export async function runDueAvailabilityRequests(db: Db, now = new Date()) {
  const due = await db.select().from(availabilityRequests).where(and(eq(availabilityRequests.status, 'scheduled'), lte(availabilityRequests.sendAt, now)))
  const results = []
  for (const req of due) {
    const church = await db.query.churches.findFirst({ where: eq(churches.id, req.churchId) })
    if (!church || church.status !== 'active') continue
    if (req.deadlineAt <= now) continue
    results.push(await dispatchRequest(db, church, req.id))
  }
  return results
}

async function dispatchRequest(db: Db, church: ChurchRow, requestId: string) {
  // Marca como enviado antes de enfileirar; mensagens têm chave própria por pessoa, então
  // um novo processamento do mesmo pedido não duplica envios.
  await db.update(availabilityRequests).set({ status: 'sent', sentAt: sql`coalesce(${availabilityRequests.sentAt}, now())` })
    .where(and(eq(availabilityRequests.id, requestId), eq(availabilityRequests.status, 'scheduled')))
  const req = await db.query.availabilityRequests.findFirst({ where: eq(availabilityRequests.id, requestId) })
  if (!req || req.status !== 'sent') return { requestId, queued: 0, blocked: 0 }
  const list = await schedulablePeople(db, church.id)
  let queued = 0
  let blocked = 0
  for (const p of list) {
    const msg = await enqueueMessage(db, {
      churchId: church.id,
      personId: p.id,
      kind: 'availability_request',
      idempotencyKey: `availability:${req.id}:${p.id}`,
      params: [firstName(p.displayName), monthName(req.month), church.name, formatServiceDate(req.deadlineAt, church.timezone), `${getConfig().appBaseUrl}/i/${church.slug}/disponibilidade/${req.month}`],
    })
    if (msg.status === 'blocked') blocked++
    else queued++
  }
  return { requestId, queued, blocked }
}

// Lembra quem ainda não respondeu. No máximo um lembrete por pessoa por dia: repetir o
// pedido no mesmo dia não duplica mensagens.
export async function remindSilent(db: Db, ctx: ChurchContext, month: string, now = new Date()) {
  requireCoordinator(ctx)
  const req = await getRequest(db, ctx.church.id, month)
  if (!req || req.status !== 'sent') throw badRequest('not_sent', 'O pedido do mês ainda não foi enviado.')
  const answered = new Set((await db.select({ personId: availabilityResponses.personId }).from(availabilityResponses).where(eq(availabilityResponses.requestId, req.id))).map((r) => r.personId))
  const day = localParts(now, ctx.church.timezone).date
  let queued = 0
  let blocked = 0
  for (const p of await schedulablePeople(db, ctx.church.id)) {
    if (answered.has(p.id)) continue
    const msg = await enqueueMessage(db, {
      churchId: ctx.church.id,
      personId: p.id,
      kind: 'availability_request',
      idempotencyKey: `availability-remind:${req.id}:${day}:${p.id}`,
      params: [firstName(p.displayName), monthName(month), ctx.church.name, formatServiceDate(req.deadlineAt, ctx.church.timezone), `${getConfig().appBaseUrl}/i/${ctx.church.slug}/disponibilidade/${month}`],
    })
    if (msg.status === 'blocked') blocked++
    else queued++
  }
  await audit(db, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'availability.reminded', entityType: 'availability_request', entityId: req.id, data: { queued, blocked } })
  return { queued, blocked }
}

// Culto criado depois do pedido: avisa as pessoas para marcarem também esse culto.
export async function notifyNewServices(db: Db, ctx: ChurchContext, month: string) {
  requireCoordinator(ctx)
  const req = await getRequest(db, ctx.church.id, month)
  if (!req || req.status !== 'sent' || !req.sentAt) throw badRequest('not_sent', 'O pedido do mês ainda não foi enviado.')
  const newer = await db.select().from(services).where(and(
    eq(services.churchId, ctx.church.id), eq(services.month, month), eq(services.status, 'scheduled'), sql`${services.createdAt} > ${req.sentAt}`,
  )).orderBy(asc(services.startsAt))
  if (!newer.length) throw badRequest('no_new_services', 'Não há cultos novos desde o pedido.')
  const key = sha256(newer.map((s) => s.id).sort().join(',')).slice(0, 16)
  const label = `${monthName(month)} (cultos novos: ${newer.map((s) => formatDateShort(s.startsAt, ctx.church.timezone)).join(', ')})`
  let queued = 0
  for (const p of await schedulablePeople(db, ctx.church.id)) {
    const msg = await enqueueMessage(db, {
      churchId: ctx.church.id,
      personId: p.id,
      kind: 'availability_request',
      idempotencyKey: `availability-new:${req.id}:${key}:${p.id}`,
      params: [firstName(p.displayName), label, ctx.church.name, formatServiceDate(req.deadlineAt, ctx.church.timezone), `${getConfig().appBaseUrl}/i/${ctx.church.slug}/disponibilidade/${month}`],
    })
    if (msg.status !== 'blocked') queued++
  }
  return { services: newer.length, queued }
}

// ---------------------------------------------------------------------------
// Resposta da pessoa
// ---------------------------------------------------------------------------

export const submitSchema = z.object({
  unavailableServiceIds: z.array(z.string().uuid()).max(100),
  note: z.string().trim().max(500).nullable().optional(),
})

export async function getAvailabilityFor(db: Db, ctx: ChurchContext, month: string, personId?: string) {
  const target = personId ?? requirePerson(ctx)
  if (target !== ctx.personId && !isCoordinator(ctx)) throw notFound('Pessoa')
  const req = await getRequest(db, ctx.church.id, month)
  const svc = await db.select().from(services).where(and(eq(services.churchId, ctx.church.id), eq(services.month, month), eq(services.status, 'scheduled'))).orderBy(asc(services.startsAt))
  const mine = svc.length
    ? await db.select({ serviceId: unavailabilities.serviceId }).from(unavailabilities)
        .where(and(eq(unavailabilities.churchId, ctx.church.id), eq(unavailabilities.personId, target), inArray(unavailabilities.serviceId, svc.map((s) => s.id))))
    : []
  const response = req
    ? await db.query.availabilityResponses.findFirst({ where: and(eq(availabilityResponses.requestId, req.id), eq(availabilityResponses.personId, target)) })
    : null
  const unavailableSet = new Set(mine.map((m) => m.serviceId))
  const scripts = svc.length
    ? await db.select({ serviceId: serviceScripts.serviceId, liturgy: serviceScripts.liturgy }).from(serviceScripts)
        .where(and(eq(serviceScripts.churchId, ctx.church.id), inArray(serviceScripts.serviceId, svc.map((s) => s.id))))
    : []
  const liturgyOf = new Map(scripts.map((r) => [r.serviceId, r.liturgy as { color?: string | null, season?: string | null }]))
  return {
    month,
    monthLabel: monthName(month),
    request: req && req.status !== 'cancelled' ? { status: req.status, sendAt: req.sendAt, deadlineAt: req.deadlineAt, sentAt: req.sentAt } : null,
    response: response ? { submittedAt: response.submittedAt, updatedAt: response.updatedAt, source: response.source, note: response.note } : null,
    services: svc.map((s) => ({
      id: s.id,
      title: s.title,
      startsAt: s.startsAt,
      localDate: s.localDate,
      time: localParts(s.startsAt, ctx.church.timezone).time,
      location: s.location,
      kind: s.kind,
      unavailable: unavailableSet.has(s.id),
      liturgy: { color: liturgyOf.get(s.id)?.color ?? null, season: liturgyOf.get(s.id)?.season ?? null },
      // Culto cadastrado depois da última resposta da pessoa.
      isNew: Boolean(response && s.createdAt > response.updatedAt),
    })),
  }
}

export async function submitAvailability(db: Db, ctx: ChurchContext, month: string, input: z.infer<typeof submitSchema>, personId?: string) {
  const target = personId ?? requirePerson(ctx)
  const onBehalf = target !== ctx.personId
  if (onBehalf) requireCoordinator(ctx)
  const result = await db.transaction(async (tx) => {
    const req = await getRequest(tx, ctx.church.id, month)
    if (!req || req.status === 'cancelled') throw badRequest('no_request', 'A coordenação ainda não abriu a coleta deste mês.')
    const person = await tx.query.people.findFirst({ where: and(eq(people.churchId, ctx.church.id), eq(people.id, target)) })
    if (!person) throw notFound('Pessoa')
    const monthServices = await tx.select({ id: services.id }).from(services).where(and(eq(services.churchId, ctx.church.id), eq(services.month, month)))
    const allowed = new Set(monthServices.map((s) => s.id))
    const wanted = new Set(input.unavailableServiceIds)
    for (const id of wanted) if (!allowed.has(id)) throw badRequest('invalid_service', 'Culto inexistente neste mês.')

    const before = await tx.select({ serviceId: unavailabilities.serviceId }).from(unavailabilities)
      .where(and(eq(unavailabilities.churchId, ctx.church.id), eq(unavailabilities.personId, target), monthServices.length ? inArray(unavailabilities.serviceId, [...allowed]) : sql`false`))
    const beforeSet = new Set(before.map((b) => b.serviceId))
    const added = [...wanted].filter((id) => !beforeSet.has(id))
    const removed = [...beforeSet].filter((id) => !wanted.has(id))
    if (removed.length) {
      await tx.delete(unavailabilities).where(and(eq(unavailabilities.churchId, ctx.church.id), eq(unavailabilities.personId, target), inArray(unavailabilities.serviceId, removed)))
    }
    if (added.length) {
      await tx.insert(unavailabilities).values(added.map((serviceId) => ({
        churchId: ctx.church.id, personId: target, serviceId, source: onBehalf ? 'coordination' : 'app', recordedByAccountId: ctx.accountId,
      }))).onConflictDoNothing()
    }
    const now = new Date()
    await tx.insert(availabilityResponses).values({
      churchId: ctx.church.id, requestId: req.id, personId: target, source: onBehalf ? 'coordination' : 'app',
      note: input.note ?? null, recordedByAccountId: ctx.accountId, submittedAt: now, updatedAt: now,
    }).onConflictDoUpdate({
      target: [availabilityResponses.requestId, availabilityResponses.personId],
      set: { updatedAt: now, note: input.note ?? null, source: onBehalf ? 'coordination' : 'app', recordedByAccountId: ctx.accountId },
    })
    await audit(tx, {
      churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'availability.submitted', entityType: 'person', entityId: target,
      data: { month, added, removed, afterDeadline: now > req.deadlineAt, source: onBehalf ? 'coordination' : 'app' },
    })
    // Indisponibilidade nova em culto onde a pessoa já está escalada, com mês publicado.
    let conflicts: { serviceId: string, startsAt: Date }[] = []
    if (added.length) {
      const sm = await tx.query.scheduleMonths.findFirst({ where: and(eq(scheduleMonths.churchId, ctx.church.id), eq(scheduleMonths.month, month)) })
      if (sm?.status === 'published') {
        conflicts = await tx.selectDistinct({ serviceId: services.id, startsAt: services.startsAt }).from(assignments)
          .innerJoin(slots, and(eq(slots.churchId, assignments.churchId), eq(slots.id, assignments.slotId)))
          .innerJoin(services, and(eq(services.churchId, slots.churchId), eq(services.id, slots.serviceId)))
          .where(and(eq(assignments.churchId, ctx.church.id), eq(assignments.personId, target), inArray(services.id, added)))
      }
    }
    return { added, removed, conflicts, personName: person.displayName, requestId: req.id }
  })
  if (result.conflicts.length) {
    // A escala não muda sozinha: a coordenação recebe o alerta e decide.
    const coordinators = await db.select().from(people).where(and(eq(people.churchId, ctx.church.id), eq(people.status, 'active'), sql`'coordinator' = any(${people.roles})`))
    const dates = result.conflicts.map((c) => formatServiceDate(c.startsAt, ctx.church.timezone)).join(', ')
    for (const c of coordinators) {
      await enqueueMessage(db, {
        churchId: ctx.church.id,
        personId: c.id,
        kind: 'coordination_alert',
        idempotencyKey: `coord:late-unavailable:${result.requestId}:${target}:${sha256(result.added.sort().join(',')).slice(0, 12)}:${c.id}`,
        params: [firstName(c.displayName), ctx.church.name, `${result.personName} informou indisponibilidade depois da publicação para ${dates}, onde está escalado(a)`, `${getConfig().appBaseUrl}/i/${ctx.church.slug}/coordenacao/escalas/${month}`],
      })
    }
  }
  return { added: result.added.length, removed: result.removed.length, conflictsWithSchedule: result.conflicts.length }
}

// Painel da coordenação: diferencia quem respondeu de quem ficou em silêncio.
export async function availabilityDashboard(db: Db, ctx: ChurchContext, month: string) {
  requireCoordinator(ctx)
  const req = await getRequest(db, ctx.church.id, month)
  const svc = await db.select().from(services).where(and(eq(services.churchId, ctx.church.id), eq(services.month, month), eq(services.status, 'scheduled'))).orderBy(asc(services.startsAt))
  const list = await schedulablePeople(db, ctx.church.id)
  const responses = req ? await db.select().from(availabilityResponses).where(eq(availabilityResponses.requestId, req.id)) : []
  const unav = svc.length ? await db.select().from(unavailabilities).where(and(eq(unavailabilities.churchId, ctx.church.id), inArray(unavailabilities.serviceId, svc.map((s) => s.id)))) : []
  const messages = req
    ? await db.select().from(outboundMessages).where(and(eq(outboundMessages.churchId, ctx.church.id), sql`${outboundMessages.idempotencyKey} like ${`availability:${req.id}:%`}`))
    : []
  const msgByPerson = new Map(messages.map((m) => [m.personId, m]))
  // Quem pode receber pelo WhatsApp (telefone e consentimento), para a coordenação saber
  // a quem perguntar pessoalmente.
  const contact = list.length
    ? await db.select({ id: people.id, phone: people.phoneE164 }).from(people).where(and(eq(people.churchId, ctx.church.id), inArray(people.id, list.map((p) => p.id))))
    : []
  const granted = new Set((await db.select({ personId: consents.personId }).from(consents)
    .where(and(eq(consents.churchId, ctx.church.id), eq(consents.status, 'granted')))).map((c) => c.personId))
  const phoneOf = new Map(contact.map((c) => [c.id, c.phone]))
  const respByPerson = new Map(responses.map((r) => [r.personId, r]))
  const nameOf = new Map(list.map((p) => [p.id, p.displayName]))
  const peopleRows = list.map((p) => {
    const r = respByPerson.get(p.id)
    const m = msgByPerson.get(p.id)
    const mine = unav.filter((u) => u.personId === p.id)
    return {
      personId: p.id,
      displayName: p.displayName,
      responded: Boolean(r),
      submittedAt: r?.submittedAt ?? null,
      updatedAt: r?.updatedAt ?? null,
      source: r?.source ?? null,
      changedAfterDeadline: Boolean(r && req && r.updatedAt > req.deadlineAt),
      unavailableServiceIds: mine.map((u) => u.serviceId),
      whatsapp: !phoneOf.get(p.id) ? 'no_phone' : granted.has(p.id) ? 'ok' : 'no_consent',
      message: m ? { status: m.status, blockedReason: m.blockedReason } : null,
    }
  })
  return {
    month,
    monthLabel: monthName(month),
    request: req ? { id: req.id, status: req.status, sendAt: req.sendAt, deadlineAt: req.deadlineAt, sentAt: req.sentAt } : null,
    // Texto exato do modelo enviado, com variáveis nomeadas ({{nome}}, {{mes}}, {{igreja}}, {{prazo}}, {{link}}).
    templateBody: TEMPLATES.availability_request.body,
    link: `${getConfig().appBaseUrl}/i/${ctx.church.slug}/disponibilidade/${month}`,
    summary: {
      people: peopleRows.length,
      responded: peopleRows.filter((p) => p.responded).length,
      silent: peopleRows.filter((p) => !p.responded).length,
    },
    people: peopleRows,
    services: svc.map((s) => ({
      id: s.id,
      title: s.title,
      startsAt: s.startsAt,
      time: localParts(s.startsAt, ctx.church.timezone).time,
      localDate: s.localDate,
      createdAfterRequest: Boolean(req?.sentAt && s.createdAt > req.sentAt),
      unavailable: unav.filter((u) => u.serviceId === s.id).map((u) => ({ personId: u.personId, name: nameOf.get(u.personId) ?? '' })),
    })),
  }
}
