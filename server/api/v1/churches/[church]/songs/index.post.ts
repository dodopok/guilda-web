import { createSong, songSchema } from '~~/server/services/liturgy'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, songSchema)
  setResponseStatus(event, 201)
  return { song: await createSong(db(), ctx, input) }
})
