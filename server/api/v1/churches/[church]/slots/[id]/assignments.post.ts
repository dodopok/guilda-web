import { assignPerson, assignSchema } from '~~/server/services/schedule'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, assignSchema)
  setResponseStatus(event, 201)
  return { assignment: await assignPerson(db(), ctx, param(event, 'id'), input) }
})
