import { createHmac } from 'node:crypto'
import { z } from 'zod'
import { safeEqual } from '../lib/crypto'

// Cliente mínimo da WhatsApp Cloud API (Meta), usado somente no servidor.
// Referência: POST /{version}/{phone-number-id}/messages com mensagem do tipo "template".

export interface CloudApiConfig {
  baseUrl: string
  version: string
  phoneNumberId: string
  accessToken: string
  fetchImpl?: typeof fetch
}

export interface TemplateSend {
  to: string // E.164
  templateName: string
  language: string
  params: string[]
}

export class ProviderError extends Error {
  constructor(message: string, public readonly retryable: boolean, public readonly code?: string) {
    super(message)
    this.name = 'ProviderError'
  }
}

// Códigos de erro da Cloud API que indicam limite de taxa ou falha temporária.
const RETRYABLE_CODES = new Set([4, 80007, 130429, 131000, 131016, 131048, 131056, 133004, 2])

const sendResponse = z.object({
  messages: z.array(z.object({ id: z.string() })).min(1),
})

const errorResponse = z.object({
  error: z.object({
    message: z.string().optional(),
    code: z.number().optional(),
    error_subcode: z.number().optional(),
  }),
})

export function buildTemplatePayload(msg: TemplateSend) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: msg.to.replace(/^\+/, ''),
    type: 'template',
    template: {
      name: msg.templateName,
      language: { code: msg.language },
      components: [
        {
          type: 'body',
          parameters: msg.params.map((text) => ({ type: 'text', text })),
        },
      ],
    },
  }
}

export async function sendTemplateMessage(config: CloudApiConfig, msg: TemplateSend): Promise<{ providerMessageId: string }> {
  const doFetch = config.fetchImpl ?? fetch
  const url = `${config.baseUrl}/${config.version}/${encodeURIComponent(config.phoneNumberId)}/messages`
  let res: Response
  try {
    res = await doFetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildTemplatePayload(msg)),
      signal: AbortSignal.timeout(15000),
    })
  } catch (err) {
    throw new ProviderError(`Falha de rede ao chamar a Cloud API: ${(err as Error).message}`, true, 'network')
  }
  const body = await res.json().catch(() => ({}))
  if (res.ok) {
    const parsed = sendResponse.safeParse(body)
    if (!parsed.success) throw new ProviderError('Resposta da Cloud API sem id de mensagem.', false, 'invalid_response')
    return { providerMessageId: parsed.data.messages[0]!.id }
  }
  const parsedErr = errorResponse.safeParse(body)
  const code = parsedErr.success ? parsedErr.data.error.code : undefined
  const message = parsedErr.success ? parsedErr.data.error.message ?? `HTTP ${res.status}` : `HTTP ${res.status}`
  const retryable = res.status >= 500 || res.status === 429 || (code !== undefined && RETRYABLE_CODES.has(code))
  throw new ProviderError(`Cloud API recusou o envio (${code ?? res.status}): ${message}`, retryable, String(code ?? res.status))
}

// Assinatura X-Hub-Signature-256 dos webhooks: HMAC-SHA256 do corpo bruto com o app secret.
export function verifyWebhookSignature(rawBody: string, header: string | undefined | null, appSecret: string): boolean {
  if (!header || !header.startsWith('sha256=')) return false
  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')}`
  return safeEqual(expected, header)
}

export const webhookPayload = z.object({
  object: z.string(),
  entry: z.array(z.object({
    id: z.string().optional(),
    changes: z.array(z.object({
      field: z.string(),
      value: z.object({
        metadata: z.object({ phone_number_id: z.string() }).partial().optional(),
        statuses: z.array(z.object({
          id: z.string(),
          status: z.string(),
          timestamp: z.string(),
          recipient_id: z.string().optional(),
          errors: z.array(z.object({ code: z.number().optional(), title: z.string().optional(), message: z.string().optional() })).optional(),
        })).optional(),
        messages: z.array(z.object({
          id: z.string(),
          from: z.string(),
          timestamp: z.string(),
          type: z.string(),
          text: z.object({ body: z.string() }).optional(),
          button: z.object({ text: z.string().optional(), payload: z.string().optional() }).optional(),
        })).optional(),
      }).passthrough(),
    })),
  })),
})

export type WebhookPayload = z.infer<typeof webhookPayload>
