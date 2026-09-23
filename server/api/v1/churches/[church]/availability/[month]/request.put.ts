import { requestSchema, scheduleRequest } from '~~/server/services/availability'
import { monthField } from '~~/server/services/worship'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, requestSchema)
  return { request: await scheduleRequest(db(), ctx, monthField.parse(getRouterParam(event, 'month')), input) }
})
