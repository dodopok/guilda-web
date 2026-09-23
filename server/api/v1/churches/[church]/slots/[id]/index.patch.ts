import { slotInputSchema, updateSlot } from '~~/server/services/worship'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, slotInputSchema.partial())
  return { slot: await updateSlot(db(), ctx, param(event, 'id'), input) }
})
