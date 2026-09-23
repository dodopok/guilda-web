import { deleteService } from '~~/server/services/worship'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  await deleteService(db(), ctx, param(event, 'id'))
  return { ok: true }
})
