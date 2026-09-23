import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db/client'
import { getConfig } from '../config'
import { accounts, authTokens, churches, people, whatsappChannels } from '../db/schema'
import { randomToken, sha256 } from '../lib/crypto'
import { forbidden } from '../lib/errors'
import { normalizePhone } from '../lib/phone'
import { nameKey } from '../lib/text'
import { audit } from './audit'
import { type Actor, type ChurchContext, requireCoordinator } from './context'

export const timezoneSchema = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: tz })
    return true
  } catch {
    return false
  }
}, 'Fuso horário inválido.')

export const createChurchSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use letras minúsculas, números e hífens.').min(2).max(60),
  timezone: timezoneSchema.default('America/Sao_Paulo'),
  defaultLocation: z.string().trim().max(200).optional(),
  // Primeira pessoa da coordenação, que receberá convite.
  coordinator: z.object({
    displayName: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(8).max(30),
  }),
})

// Cadastro de nova igreja, restrito a administradores da plataforma. Porto é a primeira
// comunidade; outras são criadas por convite, sem cadastro público.
export async function createChurch(db: Db, actor: Actor, input: z.infer<typeof createChurchSchema>) {
  if (!actor.isPlatformAdmin) throw forbidden('Somente a administração da plataforma cadastra igrejas.')
  const phone = normalizePhone(input.coordinator.phone)
  if (!phone) throw forbidden('Telefone da coordenação inválido.')
  return db.transaction(async (tx) => {
    const [church] = await tx.insert(churches).values({
      name: input.name,
      slug: input.slug,
      timezone: input.timezone,
      defaultLocation: input.defaultLocation ?? null,
    }).returning()
    await tx.insert(whatsappChannels).values({ churchId: church!.id, mode: 'disabled' })
    // Se o próprio administrador for a coordenação, vincula a conta existente.
    const actorAccount = await tx.query.accounts.findFirst({ where: eq(accounts.id, actor.accountId) })
    const [coordinator] = await tx.insert(people).values({
      churchId: church!.id,
      displayName: input.coordinator.displayName,
      nameKey: nameKey(input.coordinator.displayName),
      phoneE164: phone,
      roles: ['coordinator', 'participant'],
      accountId: actorAccount?.login === phone ? actorAccount.id : null,
    }).returning()
    // Primeiro convite: não há ainda coordenação com acesso nem canal configurado, então o
    // link é devolvido uma única vez à administração para ser entregue pessoalmente.
    let inviteLink: string | null = null
    if (!coordinator!.accountId) {
      const token = randomToken(32)
      await tx.insert(authTokens).values({
        purpose: 'invite', tokenHash: sha256(token), churchId: church!.id, personId: coordinator!.id,
        createdByAccountId: actor.accountId, expiresAt: new Date(Date.now() + 72 * 3600_000),
      })
      inviteLink = `${getConfig().appBaseUrl}/convite/${token}`
    }
    await audit(tx, { churchId: church!.id, actorAccountId: actor.accountId, action: 'church.created', entityType: 'church', entityId: church!.id })
    return { church: church!, coordinatorPersonId: coordinator!.id, inviteLink }
  })
}

export const updateChurchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  timezone: timezoneSchema.optional(),
  defaultLocation: z.string().trim().max(200).nullable().optional(),
  reminderEnabled: z.boolean().optional(),
  reminderWeekday: z.number().int().min(0).max(6).optional(),
  reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM.').optional(),
  reminderWindowDays: z.number().int().min(1).max(14).optional(),
  confirmationDeadlineHours: z.number().int().min(0).max(24 * 14).optional(),
  liturgicalPrayerBook: z.string().trim().min(2).max(40).optional(),
  liturgicalReadingType: z.enum(['complementary', 'semicontinuous']).optional(),
  accentColor: z.string().trim().toLowerCase().regex(/^#[0-9a-f]{6}$/, 'Use uma cor no formato #rrggbb.').optional(),
})

export async function updateChurch(db: Db, ctx: ChurchContext, input: z.infer<typeof updateChurchSchema>) {
  requireCoordinator(ctx)
  const reminderChanged = ['reminderEnabled', 'reminderWeekday', 'reminderTime', 'timezone'].some((k) => k in input && input[k as keyof typeof input] !== undefined)
  const [updated] = await db.update(churches).set({
    ...input,
    ...(reminderChanged ? { reminderConfigUpdatedAt: new Date() } : {}),
  }).where(eq(churches.id, ctx.church.id)).returning()
  await audit(db, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'church.updated', entityType: 'church', entityId: ctx.church.id, data: { fields: Object.keys(input) } })
  return updated!
}

export function publicChurch(church: typeof churches.$inferSelect) {
  return {
    id: church.id,
    slug: church.slug,
    name: church.name,
    timezone: church.timezone,
    defaultLocation: church.defaultLocation,
    reminderEnabled: church.reminderEnabled,
    reminderWeekday: church.reminderWeekday,
    reminderTime: church.reminderTime,
    reminderWindowDays: church.reminderWindowDays,
    confirmationDeadlineHours: church.confirmationDeadlineHours,
    liturgicalPrayerBook: church.liturgicalPrayerBook,
    liturgicalReadingType: church.liturgicalReadingType,
    accentColor: church.accentColor,
    setupCompleted: Boolean(church.setupCompletedAt),
  }
}
