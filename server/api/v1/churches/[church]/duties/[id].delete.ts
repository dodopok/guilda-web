import { deleteDuty } from '~~/server/services/catalog'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return deleteDuty(db(), ctx, param(event, 'id'))
})
