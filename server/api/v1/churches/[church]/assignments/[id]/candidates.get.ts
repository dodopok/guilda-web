import { listSwapCandidates } from '~~/server/services/responses'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return { candidates: await listSwapCandidates(db(), ctx, param(event, 'id')) }
})
