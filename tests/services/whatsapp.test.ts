import { createHmac } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { consents, messageEvents, outboundMessages, whatsappChannels } from '../../server/db/schema'
import { encryptSecret, sha256 } from '../../server/lib/crypto'
import { buildTemplatePayload } from '../../server/integrations/whatsapp-cloud'
import { buildYCloudPayload, verifyYCloudSignature } from '../../server/integrations/ycloud'
import { dispatchQueuedMessages } from '../../server/services/messaging/dispatch'
import { enqueueMessage } from '../../server/services/messaging/outbox'
import { resendMessage, setCoexistence, updateChannel } from '../../server/services/messaging/admin'
import { handleWebhook, handleYCloudWebhook, verifySubscription } from '../../server/services/messaging/webhook'
import { makeChurch, useDb } from '../helpers'

const APP_SECRET = 'segredo-do-app-meta-123456'

async function configureCloud(db: ReturnType<ReturnType<typeof useDb>>, churchId: string, extra: Partial<typeof whatsappChannels.$inferInsert> = {}) {
  await db.update(whatsappChannels).set({
    mode: 'cloud_api',
    phoneNumberId: '1234567890',
    accessTokenEnc: encryptSecret('EAAG-token-de-teste'),
    appSecretEnc: encryptSecret(APP_SECRET),
    webhookVerifyTokenHash: sha256('verificacao-123456789'),
    coexistenceStatus: 'verified',
    testMode: false,
    templates: { weekly_reminder: { name: 'guilda_lembrete', language: 'pt_BR', status: 'approved' } },
    ...extra,
  }).where(eq(whatsappChannels.churchId, churchId))
}

function sign(body: string) {
  return `sha256=${createHmac('sha256', APP_SECRET).update(body).digest('hex')}`
}

describe('canal oficial do WhatsApp', () => {
  const db = useDb()

  it('payload do modelo segue o contrato da Cloud API e parâmetros não têm quebra de linha', async () => {
    const payload = buildTemplatePayload({ to: '+5551999990000', templateName: 'guilda_lembrete', language: 'pt_BR', params: ['Ana', 'x'] })
    expect(payload).toEqual({
      messaging_product: 'whatsapp', recipient_type: 'individual', to: '5551999990000', type: 'template',
      template: { name: 'guilda_lembrete', language: { code: 'pt_BR' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ana' }, { type: 'text', text: 'x' }] }] },
    })
    const f = await makeChurch(db(), 'porto')
    const msg = await enqueueMessage(db(), { churchId: f.church.id, personId: f.ana.id, kind: 'weekly_reminder', idempotencyKey: 'k1', params: ['Ana', 'Igreja', 'linha 1\nlinha 2\t     fim', 'https://x'] })
    expect(msg.params[2]).toBe('linha 1 linha 2 fim')
  })

  it('sem a chave global de envio real, canal oficial bloqueia (não cai na simulação)', async () => {
    const f = await makeChurch(db(), 'porto')
    await configureCloud(db(), f.church.id)
    const fetchMock = vi.fn()
    await enqueueMessage(db(), { churchId: f.church.id, personId: f.ana.id, kind: 'weekly_reminder', idempotencyKey: 'k1', params: ['Ana', 'I', 't', 'l'] })
    await dispatchQueuedMessages(db(), { fetchImpl: fetchMock as unknown as typeof fetch })
    const msg = await db().query.outboundMessages.findFirst({ where: eq(outboundMessages.idempotencyKey, 'k1') })
    expect(msg).toMatchObject({ status: 'blocked', blockedReason: 'real_send_disabled' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('com envio real permitido: exige coexistência, modelo aprovado e número de teste; registra id e reenvia só falhas temporárias', async () => {
    process.env.WHATSAPP_ALLOW_REAL_SEND = 'true'
    try {
      const f = await makeChurch(db(), 'porto')
      await configureCloud(db(), f.church.id, { coexistenceStatus: 'not_verified' })
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: 'wamid.ABC' }] }), { status: 200 }))
      const opts = { fetchImpl: fetchMock as unknown as typeof fetch }
      await enqueueMessage(db(), { churchId: f.church.id, personId: f.ana.id, kind: 'weekly_reminder', idempotencyKey: 'k1', params: ['Ana', 'I', 't', 'l'] })
      await dispatchQueuedMessages(db(), opts)
      let msg = await db().query.outboundMessages.findFirst({ where: eq(outboundMessages.idempotencyKey, 'k1') })
      expect(msg).toMatchObject({ status: 'blocked', blockedReason: 'coexistence_not_verified' })

      await configureCloud(db(), f.church.id, { testMode: true, testRecipients: [] })
      await resendMessage(db(), f.coord.ctx, msg!.id)
      await dispatchQueuedMessages(db(), opts)
      msg = await db().query.outboundMessages.findFirst({ where: eq(outboundMessages.idempotencyKey, 'k1') })
      expect(msg).toMatchObject({ status: 'blocked', blockedReason: 'not_test_recipient' })

      await configureCloud(db(), f.church.id, { testMode: true, testRecipients: [f.ana.phone!] })
      await resendMessage(db(), f.coord.ctx, msg!.id)
      await dispatchQueuedMessages(db(), opts)
      msg = await db().query.outboundMessages.findFirst({ where: eq(outboundMessages.idempotencyKey, 'k1') })
      expect(msg).toMatchObject({ status: 'sent', provider: 'cloud_api', providerMessageId: 'wamid.ABC' })
      const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      expect(call[0]).toBe('https://graph.example.test/v25.0/1234567890/messages')
      expect((call[1].headers as Record<string, string>).Authorization).toBe('Bearer EAAG-token-de-teste')
      expect(JSON.parse(String(call[1].body)).template.name).toBe('guilda_lembrete')

      // Modelo não aprovado para outro tipo de mensagem: bloqueia.
      await enqueueMessage(db(), { churchId: f.church.id, personId: f.ana.id, kind: 'music_notice', idempotencyKey: 'k2', params: ['a', 'b', 'c', 'd', 'e'] })
      await dispatchQueuedMessages(db(), opts)
      expect(await db().query.outboundMessages.findFirst({ where: eq(outboundMessages.idempotencyKey, 'k2') })).toMatchObject({ blockedReason: 'template_not_approved' })

      // Falha temporária (limite de taxa) volta para a fila; falha definitiva vira "failed".
      const flaky = vi.fn(async () => new Response(JSON.stringify({ error: { code: 130429, message: 'Rate limit' } }), { status: 400 }))
      await enqueueMessage(db(), { churchId: f.church.id, personId: f.ana.id, kind: 'weekly_reminder', idempotencyKey: 'k3', params: ['a', 'b', 'c', 'd'] })
      await dispatchQueuedMessages(db(), { fetchImpl: flaky as unknown as typeof fetch })
      expect(await db().query.outboundMessages.findFirst({ where: eq(outboundMessages.idempotencyKey, 'k3') })).toMatchObject({ status: 'queued', attempts: 1 })
      const fatal = vi.fn(async () => new Response(JSON.stringify({ error: { code: 132001, message: 'Template does not exist' } }), { status: 400 }))
      await enqueueMessage(db(), { churchId: f.church.id, personId: f.ana.id, kind: 'weekly_reminder', idempotencyKey: 'k4', params: ['a', 'b', 'c', 'd'] })
      await dispatchQueuedMessages(db(), { fetchImpl: fatal as unknown as typeof fetch })
      const failed = await db().query.outboundMessages.findFirst({ where: eq(outboundMessages.idempotencyKey, 'k4') })
      expect(failed!.status).toBe('failed')
      expect(failed!.lastError).toContain('132001')
    } finally {
      process.env.WHATSAPP_ALLOW_REAL_SEND = 'false'
    }
  })

  it('consentimento revogado depois da fila impede o envio', async () => {
    const f = await makeChurch(db(), 'porto')
    await enqueueMessage(db(), { churchId: f.church.id, personId: f.ana.id, kind: 'weekly_reminder', idempotencyKey: 'k1', params: ['a', 'b', 'c', 'd'] })
    await db().update(consents).set({ status: 'revoked' }).where(eq(consents.personId, f.ana.id))
    await dispatchQueuedMessages(db())
    expect(await db().query.outboundMessages.findFirst({ where: eq(outboundMessages.idempotencyKey, 'k1') })).toMatchObject({ status: 'blocked', blockedReason: 'no_consent' })
  })

  it('webhook: assinatura obrigatória, estados idempotentes e sem regressão, PARAR revoga consentimento', async () => {
    const f = await makeChurch(db(), 'porto')
    await configureCloud(db(), f.church.id)
    const msg = await enqueueMessage(db(), { churchId: f.church.id, personId: f.ana.id, kind: 'weekly_reminder', idempotencyKey: 'k1', params: ['a', 'b', 'c', 'd'] })
    await db().update(outboundMessages).set({ status: 'sent', providerMessageId: 'wamid.XYZ' }).where(eq(outboundMessages.id, msg.id))
    const statusBody = (status: string, ts: string) => JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ id: 'waba', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: '1234567890' }, statuses: [{ id: 'wamid.XYZ', status, timestamp: ts, recipient_id: '5551' }] } }] }],
    })
    const read = statusBody('read', '1700000100')
    await expect(handleWebhook(db(), read, 'sha256=errado')).rejects.toMatchObject({ status: 401 })
    await expect(handleWebhook(db(), read, sign(read))).resolves.toMatchObject({ statusesApplied: 1 })
    const again = await handleWebhook(db(), read, sign(read))
    expect(again.duplicates).toBe(1)
    const delivered = statusBody('delivered', '1700000050')
    await handleWebhook(db(), delivered, sign(delivered))
    expect(await db().query.outboundMessages.findFirst({ where: eq(outboundMessages.id, msg.id) })).toMatchObject({ status: 'read' })

    const inbound = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '1234567890' }, messages: [{ id: 'wamid.IN1', from: f.ana.phone!.slice(1), timestamp: '1700000200', type: 'text', text: { body: 'PARAR' } }] } }] }],
    })
    const res = await handleWebhook(db(), inbound, sign(inbound))
    expect(res.optOuts).toBe(1)
    expect(await db().query.consents.findFirst({ where: eq(consents.personId, f.ana.id) })).toMatchObject({ status: 'revoked', source: 'whatsapp' })
    const events = await db().select().from(messageEvents)
    expect(JSON.stringify(events)).not.toContain('PARAR')

    await expect(verifySubscription(db(), 'subscribe', 'verificacao-123456789', 'abc')).resolves.toBe('abc')
    await expect(verifySubscription(db(), 'subscribe', 'outro', 'abc')).rejects.toMatchObject({ status: 403 })
  })

  it('configuração: segredos só de escrita; trocar número desfaz comprovação de coexistência', async () => {
    const f = await makeChurch(db(), 'porto')
    const cfg = await updateChannel(db(), f.coord.ctx, { mode: 'cloud_api', phoneNumberId: '111222333', accessToken: 'EAAG-um-token-bem-longo-123', appSecret: 'app-secret-bem-longo' })
    expect(JSON.stringify(cfg)).not.toContain('EAAG')
    expect(cfg.hasAccessToken).toBe(true)
    await setCoexistence(db(), f.coord.ctx, { status: 'verified', note: 'Teste no painel da Meta e envio pelo app no mesmo dia.' })
    const after = await updateChannel(db(), f.coord.ctx, { phoneNumberId: '999888777' })
    expect(after.coexistence.status).toBe('not_verified')
    await expect(updateChannel(db(), f.ana.ctx, { mode: 'disabled' })).rejects.toMatchObject({ status: 403 })
  })
})

const YCLOUD_SECRET = 'whsec-segredo-do-endpoint-ycloud'
const SENDER = '+5551988887777'

async function configureYCloud(db: ReturnType<ReturnType<typeof useDb>>, churchId: string, extra: Partial<typeof whatsappChannels.$inferInsert> = {}) {
  await db.update(whatsappChannels).set({
    mode: 'ycloud',
    senderPhone: SENDER,
    accessTokenEnc: encryptSecret('chave-de-api-ycloud-123456'),
    appSecretEnc: encryptSecret(YCLOUD_SECRET),
    coexistenceStatus: 'verified',
    testMode: false,
    templates: { weekly_reminder: { name: 'guilda_lembrete', language: 'pt_BR', status: 'approved' } },
    ...extra,
  }).where(eq(whatsappChannels.churchId, churchId))
}

function ysign(body: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},s=${createHmac('sha256', YCLOUD_SECRET).update(`${t}.${body}`).digest('hex')}`
}

describe('canal pelo YCloud', () => {
  const db = useDb()

  it('payload segue o contrato do envio direto: remetente, destino em E.164 e externalId', () => {
    expect(buildYCloudPayload(SENDER, { to: '+5551999990000', templateName: 'guilda_lembrete', language: 'pt_BR', params: ['Ana'] }, 'id-1')).toEqual({
      from: SENDER, to: '+5551999990000', type: 'template', externalId: 'id-1',
      template: { name: 'guilda_lembrete', language: { code: 'pt_BR' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ana' }] }] },
    })
  })

  it('mesmos bloqueios do canal oficial; envia com X-API-Key e trata falhas', async () => {
    const f = await makeChurch(db(), 'porto')
    await configureYCloud(db(), f.church.id)
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'yc-1', wamid: 'wamid.Y1', status: 'accepted' }), { status: 200 }))
    await enqueueMessage(db(), { churchId: f.church.id, personId: f.ana.id, kind: 'weekly_reminder', idempotencyKey: 'k1', params: ['a', 'b', 'c', 'd'] })
    await dispatchQueuedMessages(db(), { fetchImpl: fetchMock as unknown as typeof fetch })
    expect(await db().query.outboundMessages.findFirst({ where: eq(outboundMessages.idempotencyKey, 'k1') })).toMatchObject({ status: 'blocked', blockedReason: 'real_send_disabled' })
    expect(fetchMock).not.toHaveBeenCalled()

    process.env.WHATSAPP_ALLOW_REAL_SEND = 'true'
    try {
      await configureYCloud(db(), f.church.id, { senderPhone: null })
      await enqueueMessage(db(), { churchId: f.church.id, personId: f.ana.id, kind: 'weekly_reminder', idempotencyKey: 'k2', params: ['a', 'b', 'c', 'd'] })
      await dispatchQueuedMessages(db(), { fetchImpl: fetchMock as unknown as typeof fetch })
      expect(await db().query.outboundMessages.findFirst({ where: eq(outboundMessages.idempotencyKey, 'k2') })).toMatchObject({ blockedReason: 'missing_credentials' })

      await configureYCloud(db(), f.church.id, { testMode: true, testRecipients: ['+5551000000000'] })
      await enqueueMessage(db(), { churchId: f.church.id, personId: f.ana.id, kind: 'weekly_reminder', idempotencyKey: 'k3', params: ['a', 'b', 'c', 'd'] })
      await dispatchQueuedMessages(db(), { fetchImpl: fetchMock as unknown as typeof fetch })
      expect(await db().query.outboundMessages.findFirst({ where: eq(outboundMessages.idempotencyKey, 'k3') })).toMatchObject({ blockedReason: 'not_test_recipient' })
      expect(fetchMock).not.toHaveBeenCalled()

      await configureYCloud(db(), f.church.id, { testMode: true, testRecipients: [f.ana.phone!] })
      const msg = await enqueueMessage(db(), { churchId: f.church.id, personId: f.ana.id, kind: 'weekly_reminder', idempotencyKey: 'k4', params: ['a', 'b', 'c', 'd'] })
      await dispatchQueuedMessages(db(), { fetchImpl: fetchMock as unknown as typeof fetch })
      expect(await db().query.outboundMessages.findFirst({ where: eq(outboundMessages.id, msg.id) })).toMatchObject({ status: 'sent', provider: 'ycloud', providerMessageId: 'yc-1' })
      const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      expect(call[0]).toBe('https://ycloud.example.test/v2/whatsapp/messages/sendDirectly')
      expect((call[1].headers as Record<string, string>)['X-API-Key']).toBe('chave-de-api-ycloud-123456')
      expect(JSON.parse(String(call[1].body))).toMatchObject({ from: SENDER, to: f.ana.phone, externalId: msg.id })

      // 200 com a mensagem recusada pelo WhatsApp: falha definitiva, com o código.
      const refused = vi.fn(async () => new Response(JSON.stringify({ id: 'yc-2', status: 'failed', errorCode: '132001', errorMessage: 'Template does not exist' }), { status: 200 }))
      await enqueueMessage(db(), { churchId: f.church.id, personId: f.ana.id, kind: 'weekly_reminder', idempotencyKey: 'k5', params: ['a', 'b', 'c', 'd'] })
      await dispatchQueuedMessages(db(), { fetchImpl: refused as unknown as typeof fetch })
      const failed = await db().query.outboundMessages.findFirst({ where: eq(outboundMessages.idempotencyKey, 'k5') })
      expect(failed).toMatchObject({ status: 'failed', provider: 'ycloud' })
      expect(failed!.lastError).toContain('132001')

      // Erro temporário (limite de taxa) volta para a fila.
      const limited = vi.fn(async () => new Response(JSON.stringify({ error: { status: 429, code: 'TOO_MANY_REQUESTS', message: 'Rate limit' } }), { status: 429 }))
      await enqueueMessage(db(), { churchId: f.church.id, personId: f.ana.id, kind: 'weekly_reminder', idempotencyKey: 'k6', params: ['a', 'b', 'c', 'd'] })
      await dispatchQueuedMessages(db(), { fetchImpl: limited as unknown as typeof fetch })
      expect(await db().query.outboundMessages.findFirst({ where: eq(outboundMessages.idempotencyKey, 'k6') })).toMatchObject({ status: 'queued', provider: 'ycloud' })
    } finally {
      process.env.WHATSAPP_ALLOW_REAL_SEND = 'false'
    }
  })

  it('assinatura YCloud-Signature: HMAC de "t.corpo", rejeita horário antigo e segredo errado', () => {
    const body = '{"id":"evt"}'
    const now = new Date()
    expect(verifyYCloudSignature(body, ysign(body), YCLOUD_SECRET, now)).toBe(true)
    expect(verifyYCloudSignature(body, ysign(body), 'outro-segredo', now)).toBe(false)
    expect(verifyYCloudSignature(`${body} `, ysign(body), YCLOUD_SECRET, now)).toBe(false)
    expect(verifyYCloudSignature(body, ysign(body, Math.floor(now.getTime() / 1000) - 3600), YCLOUD_SECRET, now)).toBe(false)
    expect(verifyYCloudSignature(body, null, YCLOUD_SECRET, now)).toBe(false)
  })

  it('webhook: identifica a igreja pelo número, aplica estados sem regressão e PARAR revoga consentimento', async () => {
    const f = await makeChurch(db(), 'porto')
    const other = await makeChurch(db(), 'outra')
    await configureYCloud(db(), f.church.id)
    const msg = await enqueueMessage(db(), { churchId: f.church.id, personId: f.ana.id, kind: 'weekly_reminder', idempotencyKey: 'k1', params: ['a', 'b', 'c', 'd'] })
    await db().update(outboundMessages).set({ status: 'sent', provider: 'ycloud', providerMessageId: 'yc-9' }).where(eq(outboundMessages.id, msg.id))
    const updated = (id: string, status: string, extra: Record<string, unknown> = {}) => JSON.stringify({
      id, type: 'whatsapp.message.updated', apiVersion: 'v2', createTime: '2026-09-20T12:00:00.000Z',
      whatsappMessage: { id: 'yc-9', wamid: 'wamid.Y9', from: SENDER, to: f.ana.phone, status, externalId: msg.id, ...extra },
    })
    const read = updated('evt-1', 'read', { readTime: '2026-09-20T12:00:05.000Z' })
    await expect(handleYCloudWebhook(db(), read, 't=1,s=abc')).rejects.toMatchObject({ status: 401 })
    await expect(handleYCloudWebhook(db(), read, ysign(read))).resolves.toMatchObject({ statusesApplied: 1 })
    expect((await handleYCloudWebhook(db(), read, ysign(read))).duplicates).toBe(1)
    const delivered = updated('evt-2', 'delivered')
    await handleYCloudWebhook(db(), delivered, ysign(delivered))
    const after = await db().query.outboundMessages.findFirst({ where: eq(outboundMessages.id, msg.id) })
    expect(after).toMatchObject({ status: 'read' })
    expect(after!.readAt!.toISOString()).toBe('2026-09-20T12:00:05.000Z')

    // Número de outra igreja (ou sem canal YCloud) não é aceito, mesmo assinado.
    await configureYCloud(db(), other.church.id, { senderPhone: '+5551977776666', appSecretEnc: encryptSecret('segredo-da-outra-igreja') })
    const foreign = JSON.stringify({ id: 'evt-3', type: 'whatsapp.message.updated', whatsappMessage: { id: 'yc-9', from: '+5551977776666', status: 'failed' } })
    await expect(handleYCloudWebhook(db(), foreign, ysign(foreign))).rejects.toMatchObject({ status: 401 })
    expect(await db().query.outboundMessages.findFirst({ where: eq(outboundMessages.id, msg.id) })).toMatchObject({ status: 'read' })

    const inbound = JSON.stringify({
      id: 'evt-4', type: 'whatsapp.inbound_message.received', createTime: '2026-09-20T12:01:00.000Z',
      whatsappInboundMessage: { id: 'in-1', wamid: 'wamid.IN', from: f.ana.phone, to: SENDER, type: 'text', text: { body: 'Parar' } },
    })
    expect((await handleYCloudWebhook(db(), inbound, ysign(inbound))).optOuts).toBe(1)
    expect(await db().query.consents.findFirst({ where: eq(consents.personId, f.ana.id) })).toMatchObject({ status: 'revoked', source: 'whatsapp' })
    expect(JSON.stringify(await db().select().from(messageEvents))).not.toContain('Parar')
  })

  it('configuração: número normalizado, único entre igrejas e troca desfaz coexistência', async () => {
    const f = await makeChurch(db(), 'porto')
    const other = await makeChurch(db(), 'outra')
    const cfg = await updateChannel(db(), f.coord.ctx, { mode: 'ycloud', senderPhone: '(51) 98888-7777', accessToken: 'chave-de-api-ycloud-123456', appSecret: 'whsec-segredo-longo' })
    expect(cfg.senderPhone).toBe(SENDER)
    expect(cfg.readiness.hasCredentials).toBe(true)
    expect(JSON.stringify(cfg)).not.toContain('chave-de-api')
    await expect(updateChannel(db(), other.coord.ctx, { senderPhone: SENDER })).rejects.toMatchObject({ status: 409 })
    await setCoexistence(db(), f.coord.ctx, { status: 'verified', note: 'Número conectado no YCloud por coexistência; app segue funcionando.' })
    const moved = await updateChannel(db(), f.coord.ctx, { senderPhone: '+5551911112222' })
    expect(moved.coexistence.status).toBe('not_verified')
  })
})
