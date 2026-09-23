import { blocksSchema, replaceBlocks } from '~~/server/services/liturgy'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, blocksSchema)
  return replaceBlocks(db(), ctx, param(event, 'serviceId'), input)
})
