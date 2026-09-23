import { getMyProfile } from '~~/server/services/people'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return { profile: await getMyProfile(db(), ctx) }
})
