import { getScript } from '~~/server/services/liturgy'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return getScript(db(), ctx, param(event, 'serviceId'))
})
