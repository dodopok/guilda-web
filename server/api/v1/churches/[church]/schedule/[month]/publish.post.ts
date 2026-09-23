import { publishMonth, publishSchema } from '~~/server/services/schedule'
import { monthField } from '~~/server/services/worship'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, publishSchema)
  return publishMonth(db(), ctx, monthField.parse(getRouterParam(event, 'month')), input)
})
