import { applySchema, applySuggestions } from '~~/server/services/liturgy'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, applySchema)
  return applySuggestions(db(), ctx, param(event, 'serviceId'), input)
})
