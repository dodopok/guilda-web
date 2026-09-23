import { ministrySchema, updateMinistry } from '~~/server/services/catalog'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, ministrySchema.partial())
  return { ministry: await updateMinistry(db(), ctx, param(event, 'id'), input) }
})
