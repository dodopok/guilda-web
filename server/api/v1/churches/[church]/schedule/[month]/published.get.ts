import { getPublishedMonth } from '~~/server/services/schedule'
import { monthField } from '~~/server/services/worship'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return getPublishedMonth(db(), ctx, monthField.parse(getRouterParam(event, 'month')))
})
