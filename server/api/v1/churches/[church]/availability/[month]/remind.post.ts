import { monthField } from '~~/server/services/worship'
import { remindSilent } from '~~/server/services/availability'

// Lembra pelo WhatsApp quem ainda não respondeu ao pedido do mês.
export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return remindSilent(db(), ctx, monthField.parse(param(event, 'month')))
})
