import { scriptVersionsList } from '~~/server/services/liturgy'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return { versions: await scriptVersionsList(db(), ctx, param(event, 'serviceId')) }
})
