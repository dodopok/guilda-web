import { scriptUpdateSchema, updateScript } from '~~/server/services/liturgy'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, scriptUpdateSchema)
  return updateScript(db(), ctx, param(event, 'serviceId'), input)
})
