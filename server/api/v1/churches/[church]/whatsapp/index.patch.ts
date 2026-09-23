import { channelUpdateSchema, updateChannel } from '~~/server/services/messaging/admin'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, channelUpdateSchema)
  return updateChannel(db(), ctx, input)
})
