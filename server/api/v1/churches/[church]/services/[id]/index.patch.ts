import { serviceUpdateSchema, updateService } from '~~/server/services/worship'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, serviceUpdateSchema)
  return { service: await updateService(db(), ctx, param(event, 'id'), input) }
})
