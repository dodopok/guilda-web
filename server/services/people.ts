import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db, DbOrTx } from '../db/client'
import { authTokens, consents, duties, outboundMessages, people, qualifications } from '../db/schema'
import { badRequest, forbidden, notFound } from '../lib/errors'
import { maskPhone, normalizePhone } from '../lib/phone'
import { nameKey } from '../lib/text'
import { audit } from './audit'
import { type ChurchContext, ROLES, isCoordinator, requireCoordinator } from './context'

const phoneField = z.string().trim().max(30).nullable().optional().transform((v, c) => {
  if (v === undefined) return undefined
  if (v === null || v === '') return null
  const phone = normalizePhone(v)
  if (!phone) {
    c.addIssue({ code: 'custom', message: 'Telefone inválido. Use DDD e número, ou +código do país.' })
    return z.NEVER
  }
  return phone
})

export const personInputSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  phone: phoneField,
  roles: z.array(z.enum(ROLES as [string, ...string[]])).min(1).default(['participant']),
  restExempt: z.boolean().default(false),
  notes: z.string().trim().max(1000).nullable().optional(),
  dutyIds: z.array(z.string().uuid()).default([]),
})

export const personUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(120).optional(),
  phone: phoneField,
  roles: z.array(z.enum(ROLES as [string, ...string[]])).min(1).optional(),
  restExempt: z.boolean().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
})

async function assertDutiesInChurch(db: DbOrTx, churchId: string, dutyIds: string[]) {
  if (!dutyIds.length) return
  const found = await db.select({ id: duties.id }).from(duties).where(and(eq(duties.churchId, churchId), inArray(duties.id, dutyIds)))
  if (found.length !== new Set(dutyIds).size) throw badRequest('invalid_duty', 'Função inexistente nesta igreja.')
}

export async function createPerson(db: Db, ctx: ChurchContext, raw: z.input<typeof personInputSchema>) {
  requireCoordinator(ctx)
  const input = personInputSchema.parse(raw)
  return db.transaction(async (tx) => {
    await assertDutiesInChurch(tx, ctx.church.id, input.dutyIds)
    const [person] = await tx.insert(people).values({
      churchId: ctx.church.id,
      displayName: input.displayName,
      nameKey: nameKey(input.displayName),
      phoneE164: input.phone ?? null,
      roles: [...new Set(input.roles)],
      restExempt: input.restExempt,
      notes: input.notes ?? null,
    }).returning()
    if (input.dutyIds.length) {
      await tx.insert(qualifications).values(input.dutyIds.map((dutyId) => ({ churchId: ctx.church.id, personId: person!.id, dutyId })))
    }
    await audit(tx, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'person.created', entityType: 'person', entityId: person!.id })
    return person!
  })
}

export async function updatePerson(db: Db, ctx: ChurchContext, personId: string, raw: z.input<typeof personUpdateSchema>) {
  requireCoordinator(ctx)
  const input = personUpdateSchema.parse(raw)
  return db.transaction(async (tx) => {
    const person = await tx.query.people.findFirst({ where: and(eq(people.churchId, ctx.church.id), eq(people.id, personId)) })
    if (!person) throw notFound('Pessoa')
    const losingCoordination = person.roles.includes('coordinator')
      && ((input.roles && !input.roles.includes('coordinator')) || input.status === 'inactive')
    if (losingCoordination) {
      const [row] = await tx.select({ n: sql<number>`count(*)::int` }).from(people).where(and(
        eq(people.churchId, ctx.church.id), eq(people.status, 'active'), sql`'coordinator' = any(${people.roles})`,
      ))
      if ((row?.n ?? 0) <= 1) throw badRequest('last_coordinator', 'A igreja precisa ter ao menos uma pessoa na coordenação.')
    }
    const phoneChanged = input.phone !== undefined && input.phone !== person.phoneE164
    const [updated] = await tx.update(people).set({
      ...(input.displayName ? { displayName: input.displayName, nameKey: nameKey(input.displayName) } : {}),
      ...(input.phone !== undefined ? { phoneE164: input.phone } : {}),
      ...(input.roles ? { roles: [...new Set(input.roles)] } : {}),
      ...(input.restExempt !== undefined ? { restExempt: input.restExempt } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    }).where(and(eq(people.churchId, ctx.church.id), eq(people.id, personId))).returning()
    if (phoneChanged) {
      // Consentimento é ligado ao número informado: troca de número exige novo registro.
      await tx.update(consents).set({ status: 'revoked', revokedAt: new Date(), source: 'phone_changed', updatedAt: new Date() })
        .where(and(eq(consents.churchId, ctx.church.id), eq(consents.personId, personId), eq(consents.status, 'granted')))
      // Convites pendentes foram enviados ao número antigo.
      await tx.update(authTokens).set({ revokedAt: new Date() })
        .where(and(eq(authTokens.churchId, ctx.church.id), eq(authTokens.personId, personId), sql`${authTokens.usedAt} is null and ${authTokens.revokedAt} is null`))
    }
    await audit(tx, {
      churchId: ctx.church.id,
      actorAccountId: ctx.accountId,
      action: 'person.updated',
      entityType: 'person',
      entityId: personId,
      data: { fields: Object.keys(input).filter((k) => input[k as keyof typeof input] !== undefined), phoneChanged },
    })
    return updated!
  })
}

export async function setQualifications(db: Db, ctx: ChurchContext, personId: string, dutyIds: string[]) {
  requireCoordinator(ctx)
  await db.transaction(async (tx) => {
    const person = await tx.query.people.findFirst({ where: and(eq(people.churchId, ctx.church.id), eq(people.id, personId)) })
    if (!person) throw notFound('Pessoa')
    await assertDutiesInChurch(tx, ctx.church.id, dutyIds)
    await tx.delete(qualifications).where(and(eq(qualifications.churchId, ctx.church.id), eq(qualifications.personId, personId)))
    if (dutyIds.length) {
      await tx.insert(qualifications).values([...new Set(dutyIds)].map((dutyId) => ({ churchId: ctx.church.id, personId, dutyId })))
    }
    await audit(tx, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'person.qualifications', entityType: 'person', entityId: personId, data: { dutyIds } })
  })
}

export const consentSchema = z.object({
  status: z.enum(['granted', 'revoked']),
  source: z.enum(['presencial', 'formulario', 'app', 'whatsapp', 'outro']),
  evidenceNote: z.string().trim().max(500).nullable().optional(),
})

// Registra consentimento (ou revogação) para mensagens individuais no WhatsApp.
// A coordenação registra o que a pessoa autorizou; a própria pessoa pode alterar o seu.
export async function setConsent(db: Db, ctx: ChurchContext, personId: string, input: z.infer<typeof consentSchema>) {
  const self = ctx.personId === personId
  if (!self && !isCoordinator(ctx)) throw forbidden()
  const person = await db.query.people.findFirst({ where: and(eq(people.churchId, ctx.church.id), eq(people.id, personId)) })
  if (!person) throw notFound('Pessoa')
  if (input.status === 'granted' && !person.phoneE164) throw badRequest('no_phone', 'Cadastre o telefone antes de registrar o consentimento.')
  const now = new Date()
  const source = self && !isCoordinator(ctx) ? 'app' : input.source
  await db.insert(consents).values({
    churchId: ctx.church.id,
    personId,
    status: input.status,
    grantedAt: input.status === 'granted' ? now : null,
    revokedAt: input.status === 'revoked' ? now : null,
    source,
    evidenceNote: input.evidenceNote ?? null,
    recordedByAccountId: ctx.accountId,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [consents.churchId, consents.personId, consents.channel, consents.purpose],
    set: {
      status: input.status,
      grantedAt: input.status === 'granted' ? now : sql`${consents.grantedAt}`,
      revokedAt: input.status === 'revoked' ? now : null,
      source,
      evidenceNote: input.evidenceNote ?? null,
      recordedByAccountId: ctx.accountId,
      updatedAt: now,
    },
  })
  await audit(db, {
    churchId: ctx.church.id,
    actorAccountId: ctx.accountId,
    action: input.status === 'granted' ? 'consent.granted' : 'consent.revoked',
    entityType: 'person',
    entityId: personId,
    data: { source, phoneLast4: person.phoneE164?.slice(-4) ?? null },
  })
}

// Listagem. Coordenação vê contatos e consentimentos; demais membros veem só nomes e
// funções (necessário para propor substitutos), nunca telefones.
export async function listPeople(db: Db, ctx: ChurchContext) {
  const rows = await db.select().from(people).where(eq(people.churchId, ctx.church.id)).orderBy(asc(people.nameKey))
  const quals = await db.select({ personId: qualifications.personId, dutyId: qualifications.dutyId }).from(qualifications)
    .where(eq(qualifications.churchId, ctx.church.id))
  const dutyMap = new Map<string, string[]>()
  for (const q of quals) dutyMap.set(q.personId, [...(dutyMap.get(q.personId) ?? []), q.dutyId])

  if (!isCoordinator(ctx)) {
    return rows.filter((p) => p.status === 'active').map((p) => ({
      id: p.id,
      displayName: p.displayName,
      dutyIds: dutyMap.get(p.id) ?? [],
    }))
  }
  const consentRows = await db.select().from(consents).where(eq(consents.churchId, ctx.church.id))
  const consentMap = new Map(consentRows.map((c) => [c.personId, c]))
  const lastInvite = await db.execute<{ person_id: string, created_at: Date, used_at: Date | null, expires_at: Date, revoked_at: Date | null }>(sql`
    select distinct on (person_id) person_id, created_at, used_at, expires_at, revoked_at
    from auth_tokens where church_id = ${ctx.church.id} and purpose = 'invite'
    order by person_id, created_at desc`)
  const inviteMap = new Map(lastInvite.rows.map((r) => [r.person_id, r]))
  return rows.map((p) => {
    const c = consentMap.get(p.id)
    const inv = inviteMap.get(p.id)
    return {
      id: p.id,
      displayName: p.displayName,
      phone: p.phoneE164,
      roles: p.roles,
      restExempt: p.restExempt,
      status: p.status,
      notes: p.notes,
      hasAccount: Boolean(p.accountId),
      consent: c ? { status: c.status, source: c.source, updatedAt: c.updatedAt, evidenceNote: c.evidenceNote } : null,
      invite: inv
        ? {
            createdAt: new Date(inv.created_at),
            state: inv.used_at ? 'used' : inv.revoked_at ? 'revoked' : new Date(inv.expires_at) < new Date() ? 'expired' : 'pending',
          }
        : null,
      dutyIds: dutyMap.get(p.id) ?? [],
    }
  })
}

export async function getMyProfile(db: Db, ctx: ChurchContext) {
  const person = await db.query.people.findFirst({ where: and(eq(people.churchId, ctx.church.id), eq(people.id, ctx.personId!)) })
  if (!person) throw notFound('Pessoa')
  const consent = await db.query.consents.findFirst({ where: and(eq(consents.churchId, ctx.church.id), eq(consents.personId, person.id)) })
  const quals = await db.select({ dutyId: qualifications.dutyId, name: duties.name }).from(qualifications)
    .innerJoin(duties, and(eq(duties.churchId, qualifications.churchId), eq(duties.id, qualifications.dutyId)))
    .where(and(eq(qualifications.churchId, ctx.church.id), eq(qualifications.personId, person.id)))
  const [pending] = await db.select({ n: sql<number>`count(*)::int` }).from(outboundMessages)
    .where(and(eq(outboundMessages.churchId, ctx.church.id), eq(outboundMessages.personId, person.id), eq(outboundMessages.status, 'blocked')))
  return {
    id: person.id,
    displayName: person.displayName,
    phoneMasked: maskPhone(person.phoneE164),
    roles: person.roles,
    consent: consent ? { status: consent.status, updatedAt: consent.updatedAt, source: consent.source } : null,
    duties: quals,
    blockedMessages: pending?.n ?? 0,
  }
}
