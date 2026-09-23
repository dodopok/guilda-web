import { logoSchema, setLogo } from '~~/server/services/brand'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return setLogo(db(), ctx, await body(event, logoSchema))
})
