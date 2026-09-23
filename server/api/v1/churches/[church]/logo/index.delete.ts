import { removeLogo } from '~~/server/services/brand'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  await removeLogo(db(), ctx)
  return { ok: true }
})
