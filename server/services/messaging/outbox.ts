import { and, eq, sql } from 'drizzle-orm'
import type { DbOrTx } from '../../db/client'
import { consents, outboundMessages, people, whatsappChannels } from '../../db/schema'
import { encryptSecret } from '../../lib/crypto'
import { type MessageKind, TEMPLATES, renderPreview, sanitizeParam } from './templates'

export type OutboundMessage = typeof outboundMessages.$inferSelect
export type WhatsappChannel = typeof whatsappChannels.$inferSelect

export const BLOCK_REASONS: Record<string, string> = {
  no_phone: 'Pessoa sem telefone cadastrado',
  no_consent: 'Sem consentimento para mensagens',
  person_inactive: 'Pessoa inativa',
  channel_disabled: 'Canal de WhatsApp desativado nesta igreja',
  real_send_disabled: 'Envio real desligado no servidor (WHATSAPP_ALLOW_REAL_SEND)',
  missing_credentials: 'Canal oficial sem credenciais completas',
  coexistence_not_verified: 'Coexistência com o aplicativo WhatsApp Business ainda não comprovada',
  template_not_approved: 'Modelo de mensagem ainda não aprovado no provedor',
  not_test_recipient: 'Canal em modo de teste e número fora da lista de teste',
}

export async function getChannel(db: DbOrTx, churchId: string): Promise<WhatsappChannel | null> {
  const row = await db.query.whatsappChannels.findFirst({ where: eq(whatsappChannels.churchId, churchId) })
  return row ?? null
}

export async function hasConsent(db: DbOrTx, churchId: string, personId: string): Promise<boolean> {
  const row = await db.query.consents.findFirst({
    where: and(eq(consents.churchId, churchId), eq(consents.personId, personId), eq(consents.channel, 'whatsapp'), eq(consents.purpose, 'service_messages')),
  })
  return row?.status === 'granted'
}

export interface EnqueueInput {
  churchId: string
  personId: string
  kind: MessageKind
  idempotencyKey: string
  params: string[]
}

// Coloca a mensagem na fila. A chave de idempotência é única por igreja: repetir a
// mesma operação devolve a mensagem existente em vez de criar outra.
// Pessoas sem telefone, sem consentimento ou com canal desativado ficam "blocked",
// visíveis como pendência para a coordenação.
export async function enqueueMessage(db: DbOrTx, input: EnqueueInput): Promise<OutboundMessage> {
  const existing = await db.query.outboundMessages.findFirst({
    where: and(eq(outboundMessages.churchId, input.churchId), eq(outboundMessages.idempotencyKey, input.idempotencyKey)),
  })
  if (existing) return existing

  const def = TEMPLATES[input.kind]
  const params = input.params.map((p) => sanitizeParam(p))
  let secretParamsEnc: string | null = null
  const storedParams = [...params]
  if (def.secretParam !== undefined) {
    secretParamsEnc = encryptSecret(JSON.stringify(params))
    storedParams[def.secretParam] = ''
  }

  const person = await db.query.people.findFirst({
    where: and(eq(people.churchId, input.churchId), eq(people.id, input.personId)),
  })
  const channel = await getChannel(db, input.churchId)
  let blockedReason: string | null = null
  if (!person || person.status !== 'active') blockedReason = 'person_inactive'
  else if (!person.phoneE164) blockedReason = 'no_phone'
  else if (!(await hasConsent(db, input.churchId, person.id))) blockedReason = 'no_consent'
  else if (!channel || channel.mode === 'disabled') blockedReason = 'channel_disabled'

  const inserted = await db.insert(outboundMessages).values({
    churchId: input.churchId,
    idempotencyKey: input.idempotencyKey,
    kind: input.kind,
    personId: input.personId,
    toPhone: person?.phoneE164 ?? null,
    params: storedParams,
    secretParamsEnc,
    preview: renderPreview(input.kind, params),
    status: blockedReason ? 'blocked' : 'queued',
    blockedReason,
    nextAttemptAt: blockedReason ? null : new Date(),
  }).onConflictDoNothing({ target: [outboundMessages.churchId, outboundMessages.idempotencyKey] }).returning()

  if (inserted[0]) return inserted[0]
  // Outra transação inseriu a mesma chave ao mesmo tempo.
  const again = await db.query.outboundMessages.findFirst({
    where: and(eq(outboundMessages.churchId, input.churchId), eq(outboundMessages.idempotencyKey, input.idempotencyKey)),
  })
  return again!
}

// Reavalia uma mensagem bloqueada, com falha ou em estado incerto e a devolve à fila.
// Não altera a escala nem cria outra mensagem: a mesma linha é reaproveitada.
export async function requeueMessage(db: DbOrTx, churchId: string, messageId: string): Promise<OutboundMessage | null> {
  const msg = await db.query.outboundMessages.findFirst({
    where: and(eq(outboundMessages.churchId, churchId), eq(outboundMessages.id, messageId)),
  })
  if (!msg || !['blocked', 'failed', 'unknown'].includes(msg.status)) return null
  const person = msg.personId
    ? await db.query.people.findFirst({ where: and(eq(people.churchId, churchId), eq(people.id, msg.personId)) })
    : null
  const [updated] = await db.update(outboundMessages).set({
    status: 'queued',
    blockedReason: null,
    toPhone: person?.phoneE164 ?? msg.toPhone,
    attempts: 0,
    nextAttemptAt: new Date(),
    lastError: null,
    updatedAt: new Date(),
  }).where(and(eq(outboundMessages.id, msg.id), sql`${outboundMessages.status} in ('blocked','failed','unknown')`)).returning()
  return updated ?? null
}
