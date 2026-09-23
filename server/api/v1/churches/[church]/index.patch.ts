import { publicChurch, updateChurch, updateChurchSchema } from '~~/server/services/churches'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, updateChurchSchema)
  return { church: publicChurch(await updateChurch(db(), ctx, input)) }
})
