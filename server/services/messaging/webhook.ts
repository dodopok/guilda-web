import { and, eq } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { consents, messageEvents, outboundMessages, people, whatsappChannels } from '../../db/schema'
import { decryptSecret, sha256 } from '../../lib/crypto'
import { AppError } from '../../lib/errors'
import { normalizePhone } from '../../lib/phone'
import { verifyWebhookSignature, webhookPayload } from '../../integrations/whatsapp-cloud'
import { verifyYCloudSignature, ycloudWebhookPayload } from '../../integrations/ycloud'
import { audit } from '../audit'

// Ordem dos estados de entrega; um evento atrasado nunca faz o estado regredir.
const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 }
const OPT_OUT_WORDS = new Set(['parar', 'pare', 'sair', 'stop', 'cancelar'])

export async function verifySubscription(db: Db, mode: string | undefined, token: string | undefined, challenge: string | undefined) {
  if (mode !== 'subscribe' || !token || !challenge) throw new AppError(403, 'forbidden', 'Verificação inválida.')
  const channel = await db.query.whatsappChannels.findFirst({ where: eq(whatsappChannels.webhookVerifyTokenHash, sha256(token)) })
  if (!channel) throw new AppError(403, 'forbidden', 'Verificação inválida.')
  return challenge
}

export interface WebhookResult {
  statusesApplied: number
  duplicates: number
  optOuts: number
}

// Processa o corpo bruto do webhook. O canal (e portanto a igreja) é identificado pelo
// phone_number_id do payload e a assinatura é conferida com o app secret desse canal.
export async function handleWebhook(db: Db, rawBody: string, signature: string | undefined | null): Promise<WebhookResult> {
  let json: unknown
  try {
    json = JSON.parse(rawBody)
  } catch {
    throw new AppError(400, 'invalid_payload', 'Corpo inválido.')
  }
  const parsed = webhookPayload.safeParse(json)
  if (!parsed.success) throw new AppError(400, 'invalid_payload', 'Formato de webhook desconhecido.')

  const phoneIds = new Set<string>()
  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      const id = change.value.metadata?.phone_number_id
      if (id) phoneIds.add(id)
    }
  }
  if (phoneIds.size !== 1) throw new AppError(401, 'unauthorized', 'Canal não identificado.')
  const phoneNumberId = [...phoneIds][0]!
  const channel = await db.query.whatsappChannels.findFirst({ where: eq(whatsappChannels.phoneNumberId, phoneNumberId) })
  if (!channel?.appSecretEnc || !verifyWebhookSignature(rawBody, signature, decryptSecret(channel.appSecretEnc))) {
    throw new AppError(401, 'unauthorized', 'Assinatura inválida.')
  }
  const churchId = channel.churchId
  const result: WebhookResult = { statusesApplied: 0, duplicates: 0, optOuts: 0 }

  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      for (const st of change.value.statuses ?? []) {
        const error = st.errors?.[0]
        await applyStatus(db, churchId, result, {
          providerMessageId: st.id,
          status: st.status,
          eventKey: `status:${st.id}:${st.status}:${st.timestamp}`,
          occurredAt: new Date(Number(st.timestamp) * 1000),
          errors: st.errors?.map((e) => ({ code: e.code, title: e.title })),
          errorText: st.status === 'failed' ? `Falha informada pela Meta${error?.code ? ` (${error.code})` : ''}: ${error?.title ?? error?.message ?? 'sem detalhe'}` : undefined,
        })
      }
      for (const inbound of change.value.messages ?? []) {
        await applyInbound(db, churchId, result, {
          eventKey: `inbound:${inbound.id}`,
          kind: inbound.type,
          text: inbound.text?.body ?? inbound.button?.text ?? '',
          fromPhone: `+${inbound.from}`,
          occurredAt: new Date(Number(inbound.timestamp) * 1000),
        })
      }
    }
  }
  return result
}

interface StatusUpdate {
  providerMessageId: string
  status: string
  eventKey: string
  occurredAt: Date
  errors?: { code?: number | string, title?: string }[]
  errorText?: string
}

// Aplica um estado de entrega à mensagem da igreja. Evento repetido é ignorado e o estado
// nunca regride (um "delivered" atrasado não desfaz um "read").
async function applyStatus(db: Db, churchId: string, result: WebhookResult, st: StatusUpdate) {
  const msg = await db.query.outboundMessages.findFirst({
    where: and(eq(outboundMessages.churchId, churchId), eq(outboundMessages.providerMessageId, st.providerMessageId)),
  })
  const inserted = await db.insert(messageEvents).values({
    churchId,
    messageId: msg?.id ?? null,
    eventKey: st.eventKey,
    type: 'status',
    status: st.status,
    detail: st.errors?.length ? { errors: st.errors } : {},
    occurredAt: st.occurredAt,
  }).onConflictDoNothing().returning({ id: messageEvents.id })
  if (!inserted.length) {
    result.duplicates++
    return
  }
  if (!msg) return
  if (st.status === 'failed') {
    await db.update(outboundMessages).set({
      status: 'failed',
      lastError: (st.errorText ?? 'Falha informada pelo provedor').slice(0, 500),
      updatedAt: new Date(),
    }).where(eq(outboundMessages.id, msg.id))
  } else if ((STATUS_RANK[st.status] ?? 0) > (STATUS_RANK[msg.status] ?? 0)) {
    await db.update(outboundMessages).set({
      status: st.status,
      deliveredAt: st.status === 'delivered' ? st.occurredAt : msg.deliveredAt,
      readAt: st.status === 'read' ? st.occurredAt : msg.readAt,
      updatedAt: new Date(),
    }).where(eq(outboundMessages.id, msg.id))
  }
  result.statusesApplied++
}

interface InboundMessage {
  eventKey: string
  kind: string
  text: string
  fromPhone: string
  occurredAt: Date
}

// Mensagem recebida: só interessa o pedido para parar. Não guardamos o texto recebido
// nem o número completo, só a classificação.
async function applyInbound(db: Db, churchId: string, result: WebhookResult, inbound: InboundMessage) {
  const isOptOut = OPT_OUT_WORDS.has(inbound.text.trim().toLowerCase())
  const inserted = await db.insert(messageEvents).values({
    churchId,
    eventKey: inbound.eventKey,
    type: 'inbound',
    detail: { kind: inbound.kind, optOut: isOptOut },
    occurredAt: inbound.occurredAt,
  }).onConflictDoNothing().returning({ id: messageEvents.id })
  if (!inserted.length) {
    result.duplicates++
    return
  }
  if (!isOptOut) return
  const phone = normalizePhone(inbound.fromPhone)
  if (!phone) return
  const matches = await db.select({ id: people.id }).from(people)
    .where(and(eq(people.churchId, churchId), eq(people.phoneE164, phone)))
  for (const p of matches) {
    await db.update(consents).set({ status: 'revoked', revokedAt: new Date(), source: 'whatsapp', updatedAt: new Date() })
      .where(and(eq(consents.churchId, churchId), eq(consents.personId, p.id), eq(consents.channel, 'whatsapp')))
    await audit(db, { churchId, actorAccountId: null, action: 'consent.revoked', entityType: 'person', entityId: p.id, data: { source: 'whatsapp' } })
    result.optOuts++
  }
}

// Estados do YCloud: "accepted" é só o aceite interno do provedor e não muda nada.
const YCLOUD_STATUSES = new Set(['sent', 'delivered', 'read', 'failed'])

function parseTime(value: string | undefined, fallback: Date) {
  const d = value ? new Date(value) : fallback
  return Number.isNaN(d.getTime()) ? fallback : d
}

// Webhook do YCloud. O canal é identificado pelo número da igreja no evento (remetente de
// uma mensagem enviada ou destinatário de uma recebida), e a assinatura YCloud-Signature
// é conferida com o segredo do endpoint guardado nesse canal.
export async function handleYCloudWebhook(db: Db, rawBody: string, signature: string | undefined | null, now = new Date()): Promise<WebhookResult> {
  let json: unknown
  try {
    json = JSON.parse(rawBody)
  } catch {
    throw new AppError(400, 'invalid_payload', 'Corpo inválido.')
  }
  const parsed = ycloudWebhookPayload.safeParse(json)
  if (!parsed.success) throw new AppError(400, 'invalid_payload', 'Formato de webhook desconhecido.')
  const event = parsed.data
  const businessPhone = normalizePhone(event.whatsappMessage?.from ?? event.whatsappInboundMessage?.to ?? '')
  const channels = businessPhone
    ? await db.select().from(whatsappChannels).where(and(eq(whatsappChannels.mode, 'ycloud'), eq(whatsappChannels.senderPhone, businessPhone)))
    : []
  // Um número pertence a uma única igreja; ambiguidade é tratada como canal desconhecido.
  const channel = channels.length === 1 ? channels[0]! : null
  if (!channel?.appSecretEnc || !verifyYCloudSignature(rawBody, signature, decryptSecret(channel.appSecretEnc), now)) {
    throw new AppError(401, 'unauthorized', 'Assinatura inválida.')
  }
  const churchId = channel.churchId
  const result: WebhookResult = { statusesApplied: 0, duplicates: 0, optOuts: 0 }
  const created = parseTime(event.createTime, now)

  const m = event.whatsappMessage
  if (event.type === 'whatsapp.message.updated' && m && YCLOUD_STATUSES.has(m.status)) {
    const when = m.status === 'read' ? m.readTime : m.status === 'delivered' ? m.deliverTime : m.status === 'sent' ? m.sendTime : m.updateTime
    await applyStatus(db, churchId, result, {
      providerMessageId: m.id,
      status: m.status,
      eventKey: `ycloud:${event.id}`,
      occurredAt: parseTime(when, created),
      errors: m.errorCode ? [{ code: m.errorCode, title: m.errorMessage }] : undefined,
      errorText: m.status === 'failed' ? `Falha informada pelo YCloud${m.errorCode ? ` (${m.errorCode})` : ''}: ${m.errorMessage ?? 'sem detalhe'}` : undefined,
    })
  }
  const inbound = event.whatsappInboundMessage
  if (event.type === 'whatsapp.inbound_message.received' && inbound) {
    await applyInbound(db, churchId, result, {
      eventKey: `ycloud:${event.id}`,
      kind: inbound.type,
      text: inbound.text?.body ?? inbound.button?.text ?? '',
      fromPhone: inbound.from,
      occurredAt: parseTime(inbound.sendTime, created),
    })
  }
  return result
}
