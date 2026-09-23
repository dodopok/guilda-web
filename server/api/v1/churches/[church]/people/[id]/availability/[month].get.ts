import { getAvailabilityFor } from '~~/server/services/availability'
import { requireCoordinator } from '~~/server/services/context'
import { monthField } from '~~/server/services/worship'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  requireCoordinator(ctx)
  return getAvailabilityFor(db(), ctx, monthField.parse(getRouterParam(event, 'month')), param(event, 'id'))
})
