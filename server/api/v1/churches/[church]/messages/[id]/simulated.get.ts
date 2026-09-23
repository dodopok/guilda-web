import { simulatedMessageBody } from '~~/server/services/messaging/admin'

// Somente mensagens do modo de simulação local; nunca expõe links de envios reais.
export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return simulatedMessageBody(db(), ctx, param(event, 'id'))
})
