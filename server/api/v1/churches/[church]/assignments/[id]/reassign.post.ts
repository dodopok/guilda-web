import { reassign, reassignSchema } from '~~/server/services/schedule'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, reassignSchema)
  return { assignment: await reassign(db(), ctx, param(event, 'id'), input) }
})
