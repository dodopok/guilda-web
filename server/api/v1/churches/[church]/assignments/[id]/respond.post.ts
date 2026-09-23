import { respondSchema, respondToAssignment } from '~~/server/services/responses'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, respondSchema)
  const a = await respondToAssignment(db(), ctx, param(event, 'id'), input)
  return { assignment: { id: a.id, status: a.status, rowVersion: a.rowVersion } }
})
