import { listCatalog } from '~~/server/services/catalog'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return listCatalog(db(), ctx)
})
