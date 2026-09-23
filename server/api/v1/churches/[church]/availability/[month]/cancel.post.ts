import { cancelRequest } from '~~/server/services/availability'
import { monthField } from '~~/server/services/worship'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return { request: await cancelRequest(db(), ctx, monthField.parse(getRouterParam(event, 'month'))) }
})
