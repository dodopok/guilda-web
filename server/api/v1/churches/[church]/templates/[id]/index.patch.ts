import { z } from 'zod'
import { getTemplate, templateSchema, updateTemplate } from '~~/server/services/liturgy'

const schema = templateSchema.partial().extend({ archived: z.boolean().optional() })

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, schema)
  await updateTemplate(db(), ctx, param(event, 'id'), input)
  return { template: await getTemplate(db(), ctx, param(event, 'id')) }
})
