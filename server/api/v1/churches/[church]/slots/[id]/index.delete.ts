import { deleteSlot } from '~~/server/services/worship'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  await deleteSlot(db(), ctx, param(event, 'id'))
  return { ok: true }
})
