import { setupState } from '~~/server/services/setup'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return setupState(db(), ctx)
})
