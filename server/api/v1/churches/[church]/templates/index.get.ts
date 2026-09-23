import { listTemplates } from '~~/server/services/liturgy'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return { templates: await listTemplates(db(), ctx) }
})
