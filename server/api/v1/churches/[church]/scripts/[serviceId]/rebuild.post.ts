import { z } from 'zod'
import { rebuildFromTemplate } from '~~/server/services/liturgy'

// Refaz o roteiro pelo modelo, mantendo o que já foi preenchido.
export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, z.object({ templateId: z.string().uuid() }))
  return rebuildFromTemplate(db(), ctx, param(event, 'serviceId'), input.templateId)
})
