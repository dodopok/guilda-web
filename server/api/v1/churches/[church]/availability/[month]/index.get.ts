import { availabilityDashboard } from '~~/server/services/availability'
import { monthField } from '~~/server/services/worship'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return availabilityDashboard(db(), ctx, monthField.parse(getRouterParam(event, 'month')))
})
