import { resendMessage } from '~~/server/services/messaging/admin'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const msg = await resendMessage(db(), ctx, param(event, 'id'))
  return { message: { id: msg.id, status: msg.status } }
})
