import { getTemplate } from '~~/server/services/liturgy'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return { template: await getTemplate(db(), ctx, param(event, 'id')) }
})
