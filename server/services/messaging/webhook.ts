import { and, eq } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { consents, messageEvents, outboundMessages, people, whatsappChannels } from '../../db/schema'
import { decryptSecret, sha256 } from '../../lib/crypto'
import { AppError } from '../../lib/errors'
import { normalizePhone } from '../../lib/phone'
import { verifyWebhookSignature, webhookPayload } from '../../integrations/whatsapp-cloud'
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
        const occurredAt = new Date(Number(st.timestamp) * 1000)
        const msg = await db.query.outboundMessages.findFirst({
          where: and(eq(outboundMessages.churchId, churchId), eq(outboundMessages.providerMessageId, st.id)),
        })
        const inserted = await db.insert(messageEvents).values({
          churchId,
          messageId: msg?.id ?? null,
          eventKey: `status:${st.id}:${st.status}:${st.timestamp}`,
          type: 'status',
          status: st.status,
          detail: st.errors?.length ? { errors: st.errors.map((e) => ({ code: e.code, title: e.title })) } : {},
          occurredAt,
        }).onConflictDoNothing().returning({ id: messageEvents.id })
        if (!inserted.length) {
          result.duplicates++
          continue
        }
        if (!msg) continue
        if (st.status === 'failed') {
          const error = st.errors?.[0]
          await db.update(outboundMessages).set({
            status: 'failed',
            lastError: `Falha informada pela Meta${error?.code ? ` (${error.code})` : ''}: ${error?.title ?? error?.message ?? 'sem detalhe'}`,
            updatedAt: new Date(),
          }).where(eq(outboundMessages.id, msg.id))
        } else if ((STATUS_RANK[st.status] ?? 0) > (STATUS_RANK[msg.status] ?? 0)) {
          await db.update(outboundMessages).set({
            status: st.status,
            deliveredAt: st.status === 'delivered' ? occurredAt : msg.deliveredAt,
            readAt: st.status === 'read' ? occurredAt : msg.readAt,
            updatedAt: new Date(),
          }).where(eq(outboundMessages.id, msg.id))
        }
        result.statusesApplied++
      }

      for (const inbound of change.value.messages ?? []) {
        const text = (inbound.text?.body ?? inbound.button?.text ?? '').trim().toLowerCase()
        const isOptOut = OPT_OUT_WORDS.has(text)
        const inserted = await db.insert(messageEvents).values({
          churchId,
          eventKey: `inbound:${inbound.id}`,
          type: 'inbound',
          // Não guardamos o texto recebido nem o número completo, só a classificação.
          detail: { kind: inbound.type, optOut: isOptOut },
          occurredAt: new Date(Number(inbound.timestamp) * 1000),
        }).onConflictDoNothing().returning({ id: messageEvents.id })
        if (!inserted.length) {
          result.duplicates++
          continue
        }
        if (!isOptOut) continue
        const phone = normalizePhone(`+${inbound.from}`)
        if (!phone) continue
        const matches = await db.select({ id: people.id }).from(people)
          .where(and(eq(people.churchId, churchId), eq(people.phoneE164, phone)))
        for (const p of matches) {
          await db.update(consents).set({ status: 'revoked', revokedAt: new Date(), source: 'whatsapp', updatedAt: new Date() })
            .where(and(eq(consents.churchId, churchId), eq(consents.personId, p.id), eq(consents.channel, 'whatsapp')))
          await audit(db, { churchId, actorAccountId: null, action: 'consent.revoked', entityType: 'person', entityId: p.id, data: { source: 'whatsapp' } })
          result.optOuts++
        }
      }
    }
  }
  return result
}
