import { z } from 'zod'
import { createScript, getScript } from '~~/server/services/liturgy'

const schema = z.object({ templateId: z.string().uuid().nullable().optional() })

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, schema)
  await createScript(db(), ctx, param(event, 'serviceId'), input.templateId)
  setResponseStatus(event, 201)
  return getScript(db(), ctx, param(event, 'serviceId'))
})
