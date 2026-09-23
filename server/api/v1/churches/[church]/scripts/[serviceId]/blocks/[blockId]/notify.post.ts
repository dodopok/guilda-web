import { notifyReader } from '~~/server/services/liturgy'

// Avisa pelo WhatsApp quem foi escolhido para uma leitura.
export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return notifyReader(db(), ctx, param(event, 'serviceId'), param(event, 'blockId'))
})
