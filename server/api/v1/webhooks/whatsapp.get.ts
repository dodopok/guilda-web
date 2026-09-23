import { verifySubscription } from '~~/server/services/messaging/webhook'

// Verificação da assinatura do webhook pela Meta (hub.challenge).
export default defineApiHandler(async (event) => {
  const q = getQuery(event)
  const challenge = await verifySubscription(db(), q['hub.mode'] as string | undefined, q['hub.verify_token'] as string | undefined, q['hub.challenge'] as string | undefined)
  setHeader(event, 'Content-Type', 'text/plain')
  return challenge
})
