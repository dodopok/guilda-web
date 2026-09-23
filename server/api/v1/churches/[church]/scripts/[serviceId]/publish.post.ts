import { publishScript } from '~~/server/services/liturgy'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return publishScript(db(), ctx, param(event, 'serviceId'))
})
