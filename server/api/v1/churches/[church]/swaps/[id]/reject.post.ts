import { respondToSwap } from '~~/server/services/responses'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return { swap: await respondToSwap(db(), ctx, param(event, 'id'), false) }
})
