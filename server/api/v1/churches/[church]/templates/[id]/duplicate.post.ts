import { z } from 'zod'
import { duplicateTemplate } from '~~/server/services/liturgy'

const schema = z.object({ name: z.string().trim().min(2).max(120), kind: z.enum(['regular', 'special', 'short']).optional() })

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, schema)
  setResponseStatus(event, 201)
  return { template: await duplicateTemplate(db(), ctx, param(event, 'id'), input) }
})
