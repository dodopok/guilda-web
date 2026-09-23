import { getChannelConfig } from '~~/server/services/messaging/admin'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return getChannelConfig(db(), ctx)
})
