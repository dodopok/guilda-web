import { cancelSwap } from '~~/server/services/responses'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return { swap: await cancelSwap(db(), ctx, param(event, 'id')) }
})
