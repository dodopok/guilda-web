import { and, desc, eq, inArray, lt, ne, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../../db/client'
import { consents, outboundMessages, people, whatsappChannels } from '../../db/schema'
import { decryptSecret, encryptSecret, hasEncryptionKey, sha256 } from '../../lib/crypto'
import { AppError, badRequest, notFound } from '../../lib/errors'
import { normalizePhone } from '../../lib/phone'
import { audit } from '../audit'
import { type ChurchContext, requireCoordinator } from '../context'
import { channelReadiness } from './dispatch'
import { BLOCK_REASONS, getChannel, requeueMessage } from './outbox'
import { type MessageKind, TEMPLATES, renderTemplate } from './templates'

export async function getChannelConfig(db: Db, ctx: ChurchContext) {
  requireCoordinator(ctx)
  let channel = await getChannel(db, ctx.church.id)
  if (!channel) {
    await db.insert(whatsappChannels).values({ churchId: ctx.church.id }).onConflictDoNothing()
    channel = await getChannel(db, ctx.church.id)
  }
  const c = channel!
  // Pessoas ativas com celular, e quantas autorizaram mensagens individuais.
  const [consentStats] = await db.select({
    people: sql<number>`count(*)::int`,
    granted: sql<number>`count(*) filter (where exists (select 1 from ${consents} k where k.church_id = ${people.churchId} and k.person_id = ${people.id} and k.status = 'granted'))::int`,
  }).from(people).where(and(eq(people.churchId, ctx.church.id), eq(people.status, 'active'), sql`${people.phoneE164} is not null`))
  return {
    mode: c.mode,
    lastWebhookAt: c.lastWebhookAt,
    consents: consentStats ?? { people: 0, granted: 0 },
    phoneNumberId: c.phoneNumberId,
    senderPhone: c.senderPhone,
    businessAccountId: c.businessAccountId,
    displayPhoneLast4: c.displayPhoneLast4,
    hasAccessToken: Boolean(c.accessTokenEnc),
    hasAppSecret: Boolean(c.appSecretEnc),
    hasWebhookVerifyToken: Boolean(c.webhookVerifyTokenHash),
    coexistence: { status: c.coexistenceStatus, note: c.coexistenceNote, verifiedAt: c.coexistenceVerifiedAt },
    testMode: c.testMode,
    testRecipients: c.testRecipients,
    templates: (Object.keys(TEMPLATES) as MessageKind[]).map((kind) => ({
      kind,
      label: TEMPLATES[kind].label,
      defaultName: TEMPLATES[kind].defaultName,
      body: TEMPLATES[kind].body,
      category: TEMPLATES[kind].category,
      vars: TEMPLATES[kind].vars,
      codeExpirationMinutes: TEMPLATES[kind].codeExpirationMinutes ?? null,
      name: c.templates[kind]?.name ?? TEMPLATES[kind].defaultName,
      language: c.templates[kind]?.language ?? 'pt_BR',
      status: c.templates[kind]?.status ?? 'not_submitted',
    })),
    readiness: channelReadiness(c),
    encryptionReady: hasEncryptionKey(),
  }
}

export const channelUpdateSchema = z.object({
  mode: z.enum(['disabled', 'simulation', 'cloud_api', 'ycloud']).optional(),
  phoneNumberId: z.string().trim().regex(/^\d{5,30}$/, 'Somente números.').nullable().optional(),
  // YCloud: número da igreja em E.164, usado como remetente e para identificar os webhooks.
  senderPhone: z.string().trim().max(30).nullable().optional(),
  businessAccountId: z.string().trim().regex(/^\d{5,30}$/, 'Somente números.').nullable().optional(),
  displayPhoneLast4: z.string().trim().regex(/^\d{4}$/).nullable().optional(),
  // Segredos: só escrita. Nunca são devolvidos pela API.
  // accessToken é o token da Cloud API ou a chave de API do YCloud; appSecret é o app
  // secret da Meta ou o segredo do endpoint de webhook do YCloud.
  accessToken: z.string().trim().min(20).max(1000).optional(),
  appSecret: z.string().trim().min(16).max(200).optional(),
  webhookVerifyToken: z.string().trim().min(16).max(200).optional(),
  testMode: z.boolean().optional(),
  testRecipients: z.array(z.string()).max(20).optional(),
  templates: z.record(z.string(), z.object({
    name: z.string().trim().regex(/^[a-z0-9_]{1,512}$/, 'Nome de modelo: minúsculas, números e _.'),
    language: z.string().trim().regex(/^[a-z]{2}(_[A-Z]{2})?$/).default('pt_BR'),
    status: z.enum(['not_submitted', 'pending', 'approved', 'rejected']),
  })).optional(),
})

export async function updateChannel(db: Db, ctx: ChurchContext, input: z.infer<typeof channelUpdateSchema>) {
  requireCoordinator(ctx)
  await getChannelConfig(db, ctx)
  const needsKey = input.accessToken || input.appSecret
  if (needsKey && !hasEncryptionKey()) throw badRequest('encryption_key_missing', 'Configure SECRETS_ENCRYPTION_KEY no servidor antes de guardar credenciais.')
  if (input.templates) {
    for (const kind of Object.keys(input.templates)) {
      if (!(kind in TEMPLATES)) throw badRequest('invalid_template_kind', `Tipo de mensagem desconhecido: ${kind}`)
    }
  }
  let testRecipients: string[] | undefined
  if (input.testRecipients) {
    testRecipients = input.testRecipients.map((p) => normalizePhone(p))
      .filter((p): p is string => Boolean(p))
  }
  let senderPhone: string | null | undefined
  if (input.senderPhone !== undefined) {
    senderPhone = input.senderPhone ? normalizePhone(input.senderPhone) : null
    if (input.senderPhone && !senderPhone) throw badRequest('invalid_sender_phone', 'Número do remetente inválido. Use o formato +55 51 99999-9999.')
  }
  const current = (await getChannel(db, ctx.church.id))!
  // Cada número pertence a um só canal: os webhooks encontram a igreja por ele.
  const phoneNumberId = input.phoneNumberId ?? null
  if (phoneNumberId || senderPhone) {
    const taken = await db.select({ churchId: whatsappChannels.churchId }).from(whatsappChannels).where(and(
      ne(whatsappChannels.churchId, ctx.church.id),
      or(
        phoneNumberId ? eq(whatsappChannels.phoneNumberId, phoneNumberId) : undefined,
        senderPhone ? eq(whatsappChannels.senderPhone, senderPhone) : undefined,
      ),
    )).limit(1)
    if (taken.length) throw new AppError(409, 'phone_in_use', 'Este número já está ligado a outra igreja.')
  }
  // Trocar o número ou o provedor real desfaz a comprovação de coexistência.
  const realModes = ['cloud_api', 'ycloud']
  const resetsCoexistence = (input.phoneNumberId !== undefined && input.phoneNumberId !== current.phoneNumberId)
    || (senderPhone !== undefined && senderPhone !== current.senderPhone)
    || (input.mode !== undefined && realModes.includes(input.mode) && realModes.includes(current.mode) && input.mode !== current.mode)
  await db.update(whatsappChannels).set({
    ...(input.mode ? { mode: input.mode } : {}),
    ...(input.phoneNumberId !== undefined ? { phoneNumberId: input.phoneNumberId } : {}),
    ...(senderPhone !== undefined ? { senderPhone } : {}),
    ...(input.businessAccountId !== undefined ? { businessAccountId: input.businessAccountId } : {}),
    ...(input.displayPhoneLast4 !== undefined ? { displayPhoneLast4: input.displayPhoneLast4 } : {}),
    ...(input.accessToken ? { accessTokenEnc: encryptSecret(input.accessToken) } : {}),
    ...(input.appSecret ? { appSecretEnc: encryptSecret(input.appSecret) } : {}),
    ...(input.webhookVerifyToken ? { webhookVerifyTokenHash: sha256(input.webhookVerifyToken) } : {}),
    ...(input.testMode !== undefined ? { testMode: input.testMode } : {}),
    ...(testRecipients ? { testRecipients } : {}),
    ...(input.templates ? { templates: { ...current.templates, ...input.templates } } : {}),
    ...(resetsCoexistence
      ? { coexistenceStatus: 'not_verified', coexistenceVerifiedAt: null, coexistenceNote: null }
      : {}),
    updatedAt: new Date(),
  }).where(eq(whatsappChannels.churchId, ctx.church.id))
  await audit(db, {
    churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'whatsapp.channel_updated', entityType: 'whatsapp_channel', entityId: ctx.church.id,
    data: { fields: Object.keys(input).map((k) => (['accessToken', 'appSecret', 'webhookVerifyToken'].includes(k) ? `${k} (alterado)` : k)) },
  })
  return getChannelConfig(db, ctx)
}

export const coexistenceSchema = z.object({
  status: z.enum(['verified', 'not_verified']),
  // Evidência: como foi comprovado que o número segue ativo no aplicativo WhatsApp Business.
  note: z.string().trim().min(10).max(2000),
})

export async function setCoexistence(db: Db, ctx: ChurchContext, input: z.infer<typeof coexistenceSchema>) {
  requireCoordinator(ctx)
  const channel = await getChannel(db, ctx.church.id)
  const hasNumber = channel?.mode === 'ycloud' ? Boolean(channel.senderPhone) : Boolean(channel?.phoneNumberId)
  if (!hasNumber && input.status === 'verified') throw badRequest('missing_phone_number_id', 'Informe o número do canal antes de registrar a comprovação.')
  await db.update(whatsappChannels).set({
    coexistenceStatus: input.status,
    coexistenceNote: input.note,
    coexistenceVerifiedAt: input.status === 'verified' ? new Date() : null,
    coexistenceVerifiedByAccountId: input.status === 'verified' ? ctx.accountId : null,
    updatedAt: new Date(),
  }).where(eq(whatsappChannels.churchId, ctx.church.id))
  await audit(db, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'whatsapp.coexistence', entityType: 'whatsapp_channel', entityId: ctx.church.id, data: { status: input.status }, reason: input.note })
  return getChannelConfig(db, ctx)
}

export const listMessagesSchema = z.object({
  status: z.string().optional(),
  kind: z.string().optional(),
  before: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export async function listMessages(db: Db, ctx: ChurchContext, q: z.infer<typeof listMessagesSchema>) {
  requireCoordinator(ctx)
  const statuses = q.status ? q.status.split(',') : undefined
  const rows = await db.select({ msg: outboundMessages, personName: people.displayName }).from(outboundMessages)
    .leftJoin(people, and(eq(people.churchId, outboundMessages.churchId), eq(people.id, outboundMessages.personId)))
    .where(and(
      eq(outboundMessages.churchId, ctx.church.id),
      statuses ? inArray(outboundMessages.status, statuses) : undefined,
      q.kind ? eq(outboundMessages.kind, q.kind) : undefined,
      q.before ? lt(outboundMessages.createdAt, q.before) : undefined,
    ))
    .orderBy(desc(outboundMessages.createdAt))
    .limit(q.limit)
  const [counts] = await db.select({
    blocked: sql<number>`count(*) filter (where status = 'blocked')::int`,
    failed: sql<number>`count(*) filter (where status = 'failed')::int`,
    unknown: sql<number>`count(*) filter (where status = 'unknown')::int`,
    queued: sql<number>`count(*) filter (where status in ('queued','sending'))::int`,
    simulated: sql<number>`count(*) filter (where status = 'simulated')::int`,
    sent: sql<number>`count(*) filter (where status = 'sent')::int`,
    delivered: sql<number>`count(*) filter (where status = 'delivered')::int`,
    read: sql<number>`count(*) filter (where status = 'read')::int`,
  }).from(outboundMessages).where(eq(outboundMessages.churchId, ctx.church.id))
  return {
    counts,
    messages: rows.map(({ msg, personName }) => ({
      id: msg.id,
      kind: msg.kind,
      kindLabel: TEMPLATES[msg.kind as MessageKind]?.label ?? msg.kind,
      personId: msg.personId,
      personName,
      toPhoneLast4: msg.toPhone?.slice(-4) ?? null,
      status: msg.status,
      blockedReason: msg.blockedReason,
      blockedReasonText: msg.blockedReason ? BLOCK_REASONS[msg.blockedReason] ?? msg.blockedReason : null,
      provider: msg.provider,
      attempts: msg.attempts,
      lastError: msg.lastError,
      createdAt: msg.createdAt,
      sentAt: msg.sentAt,
      deliveredAt: msg.deliveredAt,
      readAt: msg.readAt,
      preview: msg.preview,
    })),
  }
}

// Texto completo de uma mensagem simulada, incluindo o link individual, para testes
// locais. Mensagens reais nunca expõem o link depois de enviadas.
export async function simulatedMessageBody(db: Db, ctx: ChurchContext, messageId: string) {
  requireCoordinator(ctx)
  const msg = await db.query.outboundMessages.findFirst({ where: and(eq(outboundMessages.churchId, ctx.church.id), eq(outboundMessages.id, messageId)) })
  if (!msg || msg.provider !== 'simulation' || msg.status !== 'simulated') throw notFound('Mensagem simulada')
  // Códigos de senha nunca aparecem aqui, nem simulados.
  if (TEMPLATES[msg.kind as MessageKind]?.category === 'AUTHENTICATION') return { id: msg.id, simulated: true, body: msg.preview }
  const params = msg.secretParamsEnc ? JSON.parse(decryptSecret(msg.secretParamsEnc)) as string[] : msg.params
  return { id: msg.id, simulated: true, body: renderTemplate(msg.kind as MessageKind, params) }
}

export async function resendMessage(db: Db, ctx: ChurchContext, messageId: string) {
  requireCoordinator(ctx)
  const msg = await requeueMessage(db, ctx.church.id, messageId)
  if (!msg) throw badRequest('not_resendable', 'Só mensagens bloqueadas, com falha ou em estado incerto podem voltar à fila.')
  await audit(db, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'message.requeued', entityType: 'message', entityId: messageId })
  return msg
}
