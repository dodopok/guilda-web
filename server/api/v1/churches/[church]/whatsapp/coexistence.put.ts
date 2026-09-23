import { coexistenceSchema, setCoexistence } from '~~/server/services/messaging/admin'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, coexistenceSchema)
  return setCoexistence(db(), ctx, input)
})
