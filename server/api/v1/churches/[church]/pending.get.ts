import { coordinationPending } from '~~/server/services/responses'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return coordinationPending(db(), ctx)
})
