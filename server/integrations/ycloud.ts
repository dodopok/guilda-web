import { createHmac } from 'node:crypto'
import { z } from 'zod'
import { safeEqual } from '../lib/crypto'
import { ProviderError, type TemplateSend, templateComponents } from './whatsapp-cloud'

// Cliente mínimo do YCloud (provedor oficial parceiro da Meta), usado somente no servidor.
// Referências (docs.ycloud.com): "Send a message directly" e "Webhook Integration Guide".
//   POST {base}/v2/whatsapp/messages/sendDirectly, cabeçalho X-API-Key.
//   Webhook assinado em YCloud-Signature: t={unix},s={hex(HMAC-SHA256(secret, "{t}.{corpo}"))}.

export interface YCloudConfig {
  baseUrl: string
  apiKey: string
  from: string // número remetente em E.164
  fetchImpl?: typeof fetch
}

// Mesmos códigos temporários da Cloud API, que o YCloud repassa em whatsappApiError.
const RETRYABLE_CODES = new Set(['4', '80007', '130429', '131000', '131016', '131048', '131056', '133004', '2'])

const whatsappApiError = z.object({
  code: z.union([z.number(), z.string()]).optional(),
  message: z.string().optional(),
  is_transient: z.boolean().optional(),
}).passthrough()

const messageResponse = z.object({
  id: z.string(),
  wamid: z.string().optional(),
  status: z.string().optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  whatsappApiError: whatsappApiError.optional(),
}).passthrough()

const errorResponse = z.object({
  error: z.object({
    status: z.number().optional(),
    code: z.union([z.number(), z.string()]).optional(),
    message: z.string().optional(),
    whatsappApiError: whatsappApiError.optional(),
  }).passthrough(),
})

export function buildYCloudPayload(from: string, msg: TemplateSend, externalId?: string) {
  return {
    from,
    to: msg.to,
    type: 'template',
    template: {
      name: msg.templateName,
      language: { code: msg.language },
      components: templateComponents(msg),
    },
    ...(externalId ? { externalId } : {}),
  }
}

export async function sendYCloudTemplate(config: YCloudConfig, msg: TemplateSend, externalId?: string): Promise<{ providerMessageId: string }> {
  const doFetch = config.fetchImpl ?? fetch
  let res: Response
  try {
    res = await doFetch(`${config.baseUrl}/v2/whatsapp/messages/sendDirectly`, {
      method: 'POST',
      headers: { 'X-API-Key': config.apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(buildYCloudPayload(config.from, msg, externalId)),
      signal: AbortSignal.timeout(20000),
    })
  } catch (err) {
    throw new ProviderError(`Falha de rede ao chamar o YCloud: ${(err as Error).message}`, true, 'network')
  }
  const body = await res.json().catch(() => ({}))
  if (res.ok) {
    const parsed = messageResponse.safeParse(body)
    if (!parsed.success) throw new ProviderError('Resposta do YCloud sem id de mensagem.', false, 'invalid_response')
    const m = parsed.data
    // O envio direto pode voltar 200 com a mensagem já recusada pelo WhatsApp.
    if (m.status === 'failed') {
      const code = String(m.whatsappApiError?.code ?? m.errorCode ?? 'failed')
      const retryable = m.whatsappApiError?.is_transient === true || RETRYABLE_CODES.has(code)
      throw new ProviderError(`YCloud informou falha (${code}): ${m.errorMessage ?? m.whatsappApiError?.message ?? 'sem detalhe'}`, retryable, code)
    }
    return { providerMessageId: m.id }
  }
  const parsedErr = errorResponse.safeParse(body)
  const err = parsedErr.success ? parsedErr.data.error : undefined
  const code = String(err?.whatsappApiError?.code ?? err?.code ?? res.status)
  const message = err?.whatsappApiError?.message ?? err?.message ?? `HTTP ${res.status}`
  const retryable = res.status >= 500 || res.status === 429 || err?.whatsappApiError?.is_transient === true || RETRYABLE_CODES.has(code)
  throw new ProviderError(`YCloud recusou o envio (${code}): ${message}`, retryable, code)
}

// Tolerância para o horário assinado, contra reenvio de webhooks capturados.
export const YCLOUD_SIGNATURE_TOLERANCE_SECONDS = 300

export function verifyYCloudSignature(rawBody: string, header: string | undefined | null, secret: string, now = new Date()): boolean {
  if (!header) return false
  const parts = Object.fromEntries(header.split(',').map((p) => {
    const i = p.indexOf('=')
    return [p.slice(0, i).trim(), p.slice(i + 1).trim()]
  }))
  const t = parts.t
  const s = parts.s
  if (!t || !s || !/^\d{1,12}$/.test(t)) return false
  if (Math.abs(now.getTime() / 1000 - Number(t)) > YCLOUD_SIGNATURE_TOLERANCE_SECONDS) return false
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`, 'utf8').digest('hex')
  return safeEqual(expected, s)
}

export const ycloudWebhookPayload = z.object({
  id: z.string(),
  type: z.string(),
  createTime: z.string().optional(),
  whatsappMessage: z.object({
    id: z.string(),
    wamid: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    status: z.string(),
    externalId: z.string().optional(),
    errorCode: z.string().optional(),
    errorMessage: z.string().optional(),
    updateTime: z.string().optional(),
    sendTime: z.string().optional(),
    deliverTime: z.string().optional(),
    readTime: z.string().optional(),
  }).passthrough().optional(),
  whatsappInboundMessage: z.object({
    id: z.string(),
    wamid: z.string().optional(),
    from: z.string(),
    to: z.string(),
    type: z.string(),
    sendTime: z.string().optional(),
    text: z.object({ body: z.string() }).optional(),
    button: z.object({ text: z.string().optional(), payload: z.string().optional() }).optional(),
  }).passthrough().optional(),
}).passthrough()

export type YCloudWebhookPayload = z.infer<typeof ycloudWebhookPayload>
