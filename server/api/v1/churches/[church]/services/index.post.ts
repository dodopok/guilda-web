import { createService, serviceInputSchema } from '~~/server/services/worship'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, serviceInputSchema)
  setResponseStatus(event, 201)
  return { service: await createService(db(), ctx, input) }
})
