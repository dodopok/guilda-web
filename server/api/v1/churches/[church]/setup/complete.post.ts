import { completeSetup } from '~~/server/services/setup'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return completeSetup(db(), ctx)
})
