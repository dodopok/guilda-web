import { coordinationOverview } from '~~/server/services/overview'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return coordinationOverview(db(), ctx)
})
