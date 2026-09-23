import { AppError } from '~~/server/lib/errors'
import { handleWebhook } from '~~/server/services/messaging/webhook'

// Eventos da Cloud API: estados de entrega e mensagens recebidas (PARAR).
export default defineApiHandler(async (event) => {
  rateLimit(event, 'whatsapp-webhook', 600, 60_000)
  const raw = (await readRawBody(event, 'utf8')) ?? ''
  if (raw.length > 512 * 1024) throw new AppError(413, 'payload_too_large', 'Corpo grande demais.')
  const result = await handleWebhook(db(), raw, getHeader(event, 'x-hub-signature-256'))
  return { ok: true, ...result }
})
