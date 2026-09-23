import { musicSchema, setMusic } from '~~/server/services/liturgy'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, musicSchema)
  return setMusic(db(), ctx, param(event, 'serviceId'), input)
})
