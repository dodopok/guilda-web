import { listPeople } from '~~/server/services/people'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return { people: await listPeople(db(), ctx) }
})
