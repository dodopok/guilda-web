import { notifyNewServices } from '~~/server/services/availability'
import { monthField } from '~~/server/services/worship'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return notifyNewServices(db(), ctx, monthField.parse(getRouterParam(event, 'month')))
})
