import { randomUUID } from 'node:crypto'
import { and, eq, inArray, lt, sql } from 'drizzle-orm'
import { getConfig } from '../../config'
import type { Db } from '../../db/client'
import { outboundMessages } from '../../db/schema'
import { decryptSecret } from '../../lib/crypto'
import { ProviderError, sendTemplateMessage } from '../../integrations/whatsapp-cloud'
import { type OutboundMessage, type WhatsappChannel, getChannel, hasConsent } from './outbox'
import { type MessageKind, TEMPLATES } from './templates'

// Decide por onde uma mensagem pode sair. Nunca recai silenciosamente na simulação:
// um canal oficial incompleto bloqueia a mensagem com o motivo.
export type Route
  = | { kind: 'simulation' }
    | { kind: 'cloud_api', phoneNumberId: string, accessToken: string, templateName: string, language: string }
    | { kind: 'blocked', reason: string }

export function channelReadiness(channel: WhatsappChannel | null) {
  const cfg = getConfig()
  const checks = {
    mode: channel?.mode ?? 'disabled',
    realSendAllowedByServer: cfg.whatsapp.allowRealSend,
    hasCredentials: Boolean(channel?.phoneNumberId && channel?.accessTokenEnc),
    hasWebhookSecret: Boolean(channel?.appSecretEnc),
    coexistenceVerified: channel?.coexistenceStatus === 'verified',
    testMode: channel?.testMode ?? true,
    approvedTemplates: Object.entries(channel?.templates ?? {}).filter(([, t]) => t.status === 'approved').map(([k]) => k),
  }
  const canSendReal = checks.mode === 'cloud_api' && checks.realSendAllowedByServer && checks.hasCredentials && checks.coexistenceVerified
  return { ...checks, canSendReal }
}

export function routeFor(channel: WhatsappChannel | null, kind: MessageKind, toPhone: string): Route {
  if (!channel || channel.mode === 'disabled') return { kind: 'blocked', reason: 'channel_disabled' }
  if (channel.mode === 'simulation') return { kind: 'simulation' }
  const cfg = getConfig()
  if (!cfg.whatsapp.allowRealSend) return { kind: 'blocked', reason: 'real_send_disabled' }
  if (!channel.phoneNumberId || !channel.accessTokenEnc) return { kind: 'blocked', reason: 'missing_credentials' }
  if (channel.coexistenceStatus !== 'verified') return { kind: 'blocked', reason: 'coexistence_not_verified' }
  const template = channel.templates[kind]
  if (!template || template.status !== 'approved') return { kind: 'blocked', reason: 'template_not_approved' }
  if (channel.testMode && !channel.testRecipients.includes(toPhone)) return { kind: 'blocked', reason: 'not_test_recipient' }
  return {
    kind: 'cloud_api',
    phoneNumberId: channel.phoneNumberId,
    accessToken: decryptSecret(channel.accessTokenEnc),
    templateName: template.name || TEMPLATES[kind].defaultName,
    language: template.language || 'pt_BR',
  }
}

const BACKOFF_MINUTES = [1, 5, 15, 60]
export const MAX_ATTEMPTS = 5

export interface DispatchOptions {
  now?: Date
  batchSize?: number
  fetchImpl?: typeof fetch
}

// Reserva mensagens da fila com SKIP LOCKED, para que dois trabalhadores nunca
// processem a mesma linha, e marca "sending" antes de chamar o provedor.
async function claimBatch(db: Db, now: Date, batchSize: number): Promise<OutboundMessage[]> {
  const result = await db.execute<{ id: string }>(sql`
    update outbound_messages set status = 'sending', attempts = attempts + 1, updated_at = ${now}
    where id in (
      select id from outbound_messages
      where status = 'queued' and next_attempt_at <= ${now}
      order by next_attempt_at
      limit ${batchSize}
      for update skip locked
    )
    returning id`)
  const ids = result.rows.map((r) => r.id)
  if (!ids.length) return []
  return db.select().from(outboundMessages).where(inArray(outboundMessages.id, ids))
}

export async function dispatchQueuedMessages(db: Db, opts: DispatchOptions = {}): Promise<{ processed: number }> {
  const now = opts.now ?? new Date()
  const cfg = getConfig()
  // Mensagens presas em "sending" (processo caiu durante a chamada) viram "unknown":
  // não são reenviadas automaticamente para não duplicar; a coordenação decide.
  await db.update(outboundMessages).set({ status: 'unknown', lastError: 'Envio interrompido; confirme no WhatsApp antes de reenviar.', updatedAt: now })
    .where(and(eq(outboundMessages.status, 'sending'), lt(outboundMessages.updatedAt, new Date(now.getTime() - 10 * 60_000))))

  const batch = await claimBatch(db, now, opts.batchSize ?? 20)
  for (const msg of batch) {
    await processOne(db, msg, now, cfg.whatsapp, opts.fetchImpl)
  }
  return { processed: batch.length }
}

async function processOne(db: Db, msg: OutboundMessage, now: Date, wa: ReturnType<typeof getConfig>['whatsapp'], fetchImpl?: typeof fetch) {
  const kind = msg.kind as MessageKind
  const channel = await getChannel(db, msg.churchId)
  // O consentimento é conferido de novo no envio: pode ter sido revogado depois da fila.
  if (!msg.personId || !msg.toPhone || !(await hasConsent(db, msg.churchId, msg.personId))) {
    await finish(db, msg.id, { status: 'blocked', blockedReason: msg.toPhone ? 'no_consent' : 'no_phone', nextAttemptAt: null })
    return
  }
  const route = routeFor(channel, kind, msg.toPhone)
  if (route.kind === 'blocked') {
    await finish(db, msg.id, { status: 'blocked', blockedReason: route.reason, nextAttemptAt: null })
    return
  }
  const params = msg.secretParamsEnc ? JSON.parse(decryptSecret(msg.secretParamsEnc)) as string[] : msg.params

  if (route.kind === 'simulation') {
    // Simulação local: nada sai do servidor. Estado próprio, nunca "sent".
    await finish(db, msg.id, {
      status: 'simulated',
      provider: 'simulation',
      providerMessageId: `sim-${randomUUID()}`,
      sentAt: now,
      nextAttemptAt: null,
    })
    return
  }

  try {
    const { providerMessageId } = await sendTemplateMessage({
      baseUrl: wa.graphBaseUrl,
      version: wa.graphVersion,
      phoneNumberId: route.phoneNumberId,
      accessToken: route.accessToken,
      fetchImpl,
    }, { to: msg.toPhone, templateName: route.templateName, language: route.language, params })
    await finish(db, msg.id, {
      status: 'sent',
      provider: 'cloud_api',
      providerMessageId,
      sentAt: now,
      secretParamsEnc: null,
      lastError: null,
      nextAttemptAt: null,
    })
  } catch (err) {
    const retryable = err instanceof ProviderError ? err.retryable : false
    const message = (err as Error).message.slice(0, 500)
    if (retryable && msg.attempts < MAX_ATTEMPTS) {
      const minutes = BACKOFF_MINUTES[Math.min(msg.attempts - 1, BACKOFF_MINUTES.length - 1)]!
      await finish(db, msg.id, { status: 'queued', provider: 'cloud_api', lastError: message, nextAttemptAt: new Date(now.getTime() + minutes * 60_000) })
    } else {
      await finish(db, msg.id, { status: 'failed', provider: 'cloud_api', lastError: message, nextAttemptAt: null })
    }
  }
}

async function finish(db: Db, id: string, values: Partial<typeof outboundMessages.$inferInsert>) {
  await db.update(outboundMessages).set({ ...values, updatedAt: new Date() }).where(eq(outboundMessages.id, id))
}
