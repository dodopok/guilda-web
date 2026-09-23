import { listMessages, listMessagesSchema } from '~~/server/services/messaging/admin'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return listMessages(db(), ctx, query(event, listMessagesSchema))
})
