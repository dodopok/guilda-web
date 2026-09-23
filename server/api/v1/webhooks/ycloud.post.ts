import { AppError } from '~~/server/lib/errors'
import { handleYCloudWebhook } from '~~/server/services/messaging/webhook'

// Eventos do YCloud: estados de entrega e mensagens recebidas (PARAR).
export default defineApiHandler(async (event) => {
  rateLimit(event, 'ycloud-webhook', 600, 60_000)
  const raw = (await readRawBody(event, 'utf8')) ?? ''
  if (raw.length > 512 * 1024) throw new AppError(413, 'payload_too_large', 'Corpo grande demais.')
  const result = await handleYCloudWebhook(db(), raw, getHeader(event, 'ycloud-signature'))
  return { ok: true, ...result }
})
