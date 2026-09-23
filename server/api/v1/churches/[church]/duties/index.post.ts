import { createDuty, dutySchema } from '~~/server/services/catalog'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, dutySchema)
  setResponseStatus(event, 201)
  return { duty: await createDuty(db(), ctx, input) }
})
