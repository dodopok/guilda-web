import { dutySchema, updateDuty } from '~~/server/services/catalog'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, dutySchema.partial())
  return { duty: await updateDuty(db(), ctx, param(event, 'id'), input) }
})
