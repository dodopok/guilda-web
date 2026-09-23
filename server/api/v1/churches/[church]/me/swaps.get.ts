import { mySwaps } from '~~/server/services/responses'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return { swaps: await mySwaps(db(), ctx) }
})
