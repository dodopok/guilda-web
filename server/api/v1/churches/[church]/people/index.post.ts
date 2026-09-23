import { createPerson, personInputSchema } from '~~/server/services/people'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, personInputSchema)
  setResponseStatus(event, 201)
  return { person: await createPerson(db(), ctx, input) }
})
