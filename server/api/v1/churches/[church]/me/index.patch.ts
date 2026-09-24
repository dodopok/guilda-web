import { myProfileUpdateSchema, updateMyProfile } from '~~/server/services/people'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, myProfileUpdateSchema)
  return { profile: await updateMyProfile(db(), ctx, input) }
})
