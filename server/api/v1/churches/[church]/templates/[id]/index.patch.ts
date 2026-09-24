import { z } from 'zod'
import { getTemplate, templateSchema, updateTemplate } from '~~/server/services/liturgy'

// applyToUpcoming: leva os blocos novos aos próximos roteiros ainda não publicados.
const schema = templateSchema.partial().extend({ archived: z.boolean().optional(), applyToUpcoming: z.boolean().optional() })

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, schema)
  const r = await updateTemplate(db(), ctx, param(event, 'id'), input)
  return { template: await getTemplate(db(), ctx, param(event, 'id')), updatedScripts: r.updatedScripts }
})
