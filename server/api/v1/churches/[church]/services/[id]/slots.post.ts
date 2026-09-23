import { addSlot, slotInputSchema } from '~~/server/services/worship'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, slotInputSchema)
  setResponseStatus(event, 201)
  return { slot: await addSlot(db(), ctx, param(event, 'id'), input) }
})
