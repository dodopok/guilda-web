import { proposeSwap, proposeSwapSchema } from '~~/server/services/responses'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, proposeSwapSchema)
  setResponseStatus(event, 201)
  return { swap: await proposeSwap(db(), ctx, param(event, 'id'), input) }
})
