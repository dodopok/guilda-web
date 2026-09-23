import { applySetupDuties, setupDutiesSchema } from '~~/server/services/setup'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return applySetupDuties(db(), ctx, await body(event, setupDutiesSchema))
})
