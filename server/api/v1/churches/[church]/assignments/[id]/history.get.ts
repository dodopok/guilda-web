import { assignmentHistory } from '~~/server/services/responses'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return { responses: await assignmentHistory(db(), ctx, param(event, 'id')) }
})
