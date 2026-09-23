import { createMinistry, ministrySchema } from '~~/server/services/catalog'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, ministrySchema)
  setResponseStatus(event, 201)
  return { ministry: await createMinistry(db(), ctx, input) }
})
