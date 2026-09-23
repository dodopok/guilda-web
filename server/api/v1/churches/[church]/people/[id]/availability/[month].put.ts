import { submitAvailability, submitSchema } from '~~/server/services/availability'
import { monthField } from '~~/server/services/worship'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, submitSchema)
  return submitAvailability(db(), ctx, monthField.parse(getRouterParam(event, 'month')), input, param(event, 'id'))
})
