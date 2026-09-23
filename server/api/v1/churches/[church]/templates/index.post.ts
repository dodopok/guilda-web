import { createTemplate, templateSchema } from '~~/server/services/liturgy'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, templateSchema)
  setResponseStatus(event, 201)
  return { template: await createTemplate(db(), ctx, input) }
})
