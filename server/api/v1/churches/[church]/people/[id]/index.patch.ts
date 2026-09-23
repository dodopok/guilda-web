import { personUpdateSchema, updatePerson } from '~~/server/services/people'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, personUpdateSchema)
  return { person: await updatePerson(db(), ctx, param(event, 'id'), input) }
})
