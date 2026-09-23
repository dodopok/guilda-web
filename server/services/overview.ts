import { and, asc, eq, gt, gte, inArray, isNotNull, ne, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import {
  availabilityRequests,
  availabilityResponses,
  consents,
  duties,
  liturgyTemplates,
  outboundMessages,
  people,
  qualifications,
  scheduleMonths,
  serviceScripts,
  services,
  swapRequests,
  assignments,
  slots,
} from '../db/schema'
import { localParts, monthName } from '../lib/time'
import { type ChurchContext, isCoordinator, requireCoordinator } from './context'
import { getChannel } from './messaging/outbox'
import { myTasks } from './schedule'

function monthsAround(now: Date, tz: string) {
  const current = localParts(now, tz).month
  const [y, m] = current.split('-').map(Number)
  const next = m === 12 ? `${y! + 1}-01` : `${y}-${String(m! + 1).padStart(2, '0')}`
  return { current, next }
}

// Início do participante: próxima tarefa em destaque, pedidos que esperam resposta
// (trocas e indisponibilidade) e o próximo roteiro publicado.
export async function memberHome(db: Db, ctx: ChurchContext, now = new Date()) {
  const tasks = await myTasks(db, ctx, { from: new Date(now.getTime() - 3 * 3600_000) })
  const upcoming = tasks.filter((t) => t.service.status === 'scheduled')
  const swapsReceived = ctx.personId
    ? await db.select({ n: sql<number>`count(*)::int` }).from(swapRequests)
        .innerJoin(assignments, and(eq(assignments.churchId, swapRequests.churchId), eq(assignments.id, swapRequests.assignmentId)))
        .innerJoin(slots, and(eq(slots.churchId, assignments.churchId), eq(slots.id, assignments.slotId)))
        .innerJoin(services, and(eq(services.churchId, slots.churchId), eq(services.id, slots.serviceId)))
        .where(and(eq(swapRequests.churchId, ctx.church.id), eq(swapRequests.candidatePersonId, ctx.personId), eq(swapRequests.status, 'proposed'), gt(services.startsAt, now)))
    : [{ n: 0 }]
  const { current, next } = monthsAround(now, ctx.church.timezone)
  const reqs = await db.select().from(availabilityRequests).where(and(
    eq(availabilityRequests.churchId, ctx.church.id), inArray(availabilityRequests.month, [current, next]), eq(availabilityRequests.status, 'sent'),
  )).orderBy(asc(availabilityRequests.month))
  const availability = []
  for (const r of reqs) {
    const resp = ctx.personId
      ? await db.query.availabilityResponses.findFirst({ where: and(eq(availabilityResponses.requestId, r.id), eq(availabilityResponses.personId, ctx.personId)) })
      : null
    if (r.deadlineAt < now && resp) continue
    availability.push({ month: r.month, monthLabel: monthName(r.month), deadlineAt: r.deadlineAt, responded: Boolean(resp), respondedAt: resp?.updatedAt ?? null })
  }
  const nextScript = await db.select({ serviceId: services.id, title: services.title, startsAt: services.startsAt, liturgy: serviceScripts.liturgy, version: serviceScripts.version })
    .from(serviceScripts)
    .innerJoin(services, and(eq(services.churchId, serviceScripts.churchId), eq(services.id, serviceScripts.serviceId)))
    .where(and(eq(serviceScripts.churchId, ctx.church.id), gt(serviceScripts.version, 0), gte(services.startsAt, new Date(now.getTime() - 3 * 3600_000))))
    .orderBy(asc(services.startsAt)).limit(1)
  const script = nextScript[0]
  // Cor e tempo litúrgico dos cultos das próximas tarefas (quando o roteiro já tem).
  const taskServiceIds = [...new Set(upcoming.map((t) => t.service.id))]
  const liturgyRows = taskServiceIds.length
    ? await db.select({ serviceId: serviceScripts.serviceId, liturgy: serviceScripts.liturgy }).from(serviceScripts)
        .where(and(eq(serviceScripts.churchId, ctx.church.id), inArray(serviceScripts.serviceId, taskServiceIds)))
    : []
  const nextMonthRow = await db.query.scheduleMonths.findFirst({ where: and(eq(scheduleMonths.churchId, ctx.church.id), eq(scheduleMonths.month, next)) })
  const nextMonthServices = await db.select({ n: sql<number>`count(*)::int` }).from(services)
    .where(and(eq(services.churchId, ctx.church.id), eq(services.month, next), eq(services.status, 'scheduled')))
  return {
    serviceLiturgy: Object.fromEntries(liturgyRows.map((r) => {
      const l = r.liturgy as { color?: string | null, season?: string | null, sundayName?: string | null, celebration?: string | null }
      return [r.serviceId, { color: l.color ?? null, season: l.season ?? null, sundayName: l.sundayName ?? l.celebration ?? null }]
    })),
    nextMonth: { month: next, monthLabel: monthName(next), published: nextMonthRow?.status === 'published', hasServices: (nextMonthServices[0]?.n ?? 0) > 0 },
    tasks: upcoming,
    swapsWaiting: swapsReceived[0]?.n ?? 0,
    availability,
    nextScript: script ? { serviceId: script.serviceId, title: script.title, startsAt: script.startsAt, color: (script.liturgy as { color?: string | null }).color ?? null } : null,
    isCoordinator: isCoordinator(ctx),
  }
}

// Painel inicial da coordenação: roteiro de configuração e o que pede atenção agora.
export async function coordinationOverview(db: Db, ctx: ChurchContext, now = new Date()) {
  requireCoordinator(ctx)
  const churchId = ctx.church.id
  const count = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0
  const { current, next } = monthsAround(now, ctx.church.timezone)
  const dutyCount = await count(db.select({ n: sql<number>`count(*)::int` }).from(duties).where(and(eq(duties.churchId, churchId), eq(duties.active, true))))
  const peopleCount = await count(db.select({ n: sql<number>`count(*)::int` }).from(people).where(and(eq(people.churchId, churchId), eq(people.status, 'active'))))
  const qualifiedPeople = await count(db.select({ n: sql<number>`count(distinct ${qualifications.personId})::int` }).from(qualifications).where(eq(qualifications.churchId, churchId)))
  const withPhone = await count(db.select({ n: sql<number>`count(*)::int` }).from(people).where(and(eq(people.churchId, churchId), eq(people.status, 'active'), isNotNull(people.phoneE164))))
  const withConsent = await count(db.select({ n: sql<number>`count(*)::int` }).from(consents).innerJoin(people, and(eq(people.churchId, consents.churchId), eq(people.id, consents.personId)))
    .where(and(eq(consents.churchId, churchId), eq(consents.status, 'granted'), eq(people.status, 'active'))))
  const withAccount = await count(db.select({ n: sql<number>`count(*)::int` }).from(people).where(and(eq(people.churchId, churchId), eq(people.status, 'active'), isNotNull(people.accountId))))
  const templateCount = await count(db.select({ n: sql<number>`count(*)::int` }).from(liturgyTemplates).where(and(eq(liturgyTemplates.churchId, churchId), eq(liturgyTemplates.archived, false))))

  const monthInfo = async (month: string) => {
    const svc = await count(db.select({ n: sql<number>`count(*)::int` }).from(services).where(and(eq(services.churchId, churchId), eq(services.month, month), eq(services.status, 'scheduled'))))
    const sm = await db.query.scheduleMonths.findFirst({ where: and(eq(scheduleMonths.churchId, churchId), eq(scheduleMonths.month, month)) })
    const req = await db.query.availabilityRequests.findFirst({ where: and(eq(availabilityRequests.churchId, churchId), eq(availabilityRequests.month, month)) })
    const responses = req ? await count(db.select({ n: sql<number>`count(*)::int` }).from(availabilityResponses).where(eq(availabilityResponses.requestId, req.id))) : 0
    const firstService = await db.query.services.findFirst({ where: and(eq(services.churchId, churchId), eq(services.month, month), eq(services.status, 'scheduled')), orderBy: asc(services.startsAt) })
    const nextService = await db.query.services.findFirst({ where: and(eq(services.churchId, churchId), eq(services.month, month), eq(services.status, 'scheduled'), gt(services.startsAt, now)), orderBy: asc(services.startsAt) })
    // Vagas: soma do que cada posto pede e do que já tem gente (recusas não contam).
    const fill = await db.execute<{ required: number, filled: number, people: number, pending: number }>(sql`
      select coalesce(sum(sl.required_count), 0)::int as required,
             coalesce(sum(least(sl.required_count, (select count(*) from assignments a where a.church_id = sl.church_id and a.slot_id = sl.id and a.status <> 'declined'))), 0)::int as filled,
             (select count(distinct a.person_id) from assignments a join slots s2 on s2.church_id = a.church_id and s2.id = a.slot_id join services v2 on v2.church_id = s2.church_id and v2.id = s2.service_id
               where a.church_id = ${churchId} and v2.month = ${month} and v2.status = 'scheduled' and a.status <> 'declined')::int as people,
             (select count(*) from assignments a join slots s2 on s2.church_id = a.church_id and s2.id = a.slot_id join services v2 on v2.church_id = s2.church_id and v2.id = s2.service_id
               where a.church_id = ${churchId} and v2.month = ${month} and v2.status = 'scheduled' and a.status = 'pending' and v2.starts_at > ${now})::int as pending
      from slots sl join services v on v.church_id = sl.church_id and v.id = sl.service_id
      where sl.church_id = ${churchId} and v.month = ${month} and v.status = 'scheduled'`)
    const f = fill.rows[0] ?? { required: 0, filled: 0, people: 0, pending: 0 }
    return {
      month,
      monthLabel: monthName(month),
      services: svc,
      firstServiceAt: firstService?.startsAt ?? null,
      nextServiceAt: nextService?.startsAt ?? null,
      slots: { required: Number(f.required), filled: Number(f.filled) },
      scheduledPeople: Number(f.people),
      pendingConfirmations: Number(f.pending),
      schedule: { status: sm?.status ?? 'draft', version: sm?.version ?? 0, publishedAt: sm?.publishedAt ?? null },
      availability: req ? { status: req.status, sendAt: req.sendAt, deadlineAt: req.deadlineAt, responses } : null,
    }
  }
  const channel = await getChannel(db, churchId)
  const problems = await count(db.select({ n: sql<number>`count(*)::int` }).from(outboundMessages)
    .where(and(eq(outboundMessages.churchId, churchId), inArray(outboundMessages.status, ['failed', 'unknown']))))
  const blocked = await count(db.select({ n: sql<number>`count(*)::int` }).from(outboundMessages)
    .where(and(eq(outboundMessages.churchId, churchId), eq(outboundMessages.status, 'blocked'), gt(outboundMessages.createdAt, new Date(now.getTime() - 30 * 86400_000)))))
  const declined = await count(db.select({ n: sql<number>`count(*)::int` }).from(assignments)
    .innerJoin(slots, and(eq(slots.churchId, assignments.churchId), eq(slots.id, assignments.slotId)))
    .innerJoin(services, and(eq(services.churchId, slots.churchId), eq(services.id, slots.serviceId)))
    .where(and(eq(assignments.churchId, churchId), eq(assignments.status, 'declined'), gt(services.startsAt, now), ne(services.status, 'cancelled'))))
  return {
    counts: { duties: dutyCount, people: peopleCount, qualifiedPeople, withPhone, withConsent, withAccount, templates: templateCount },
    months: [await monthInfo(current), await monthInfo(next)],
    whatsapp: { mode: channel?.mode ?? 'disabled', coexistence: channel?.coexistenceStatus ?? 'not_verified' },
    reminder: { enabled: ctx.church.reminderEnabled, weekday: ctx.church.reminderWeekday, time: ctx.church.reminderTime },
    attention: { declined, messageProblems: problems, blockedMessages: blocked },
  }
}

// Quantas pessoas avisaram que não podem em cultos futuros já publicados (selo da Mesa).
export async function attentionCount(db: Db, churchId: string, now = new Date()) {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(assignments)
    .innerJoin(slots, and(eq(slots.churchId, assignments.churchId), eq(slots.id, assignments.slotId)))
    .innerJoin(services, and(eq(services.churchId, slots.churchId), eq(services.id, slots.serviceId)))
    .innerJoin(scheduleMonths, and(eq(scheduleMonths.churchId, services.churchId), eq(scheduleMonths.month, services.month)))
    .where(and(eq(assignments.churchId, churchId), eq(assignments.status, 'declined'), gt(services.startsAt, now), eq(services.status, 'scheduled'), eq(scheduleMonths.status, 'published')))
  return row?.n ?? 0
}

// Cor litúrgica do próximo culto com roteiro (publicado ou rascunho), para a interface.
export async function currentLiturgicalColor(db: Db, churchId: string, now = new Date()) {
  const rows = await db.select({ liturgy: serviceScripts.liturgy }).from(serviceScripts)
    .innerJoin(services, and(eq(services.churchId, serviceScripts.churchId), eq(services.id, serviceScripts.serviceId)))
    .where(and(eq(serviceScripts.churchId, churchId), gte(services.startsAt, new Date(now.getTime() - 6 * 3600_000))))
    .orderBy(asc(services.startsAt)).limit(1)
  return (rows[0]?.liturgy as { color?: string | null } | undefined)?.color ?? null
}
