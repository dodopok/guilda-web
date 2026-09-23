import { songSchema, updateSong } from '~~/server/services/liturgy'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, songSchema.partial())
  return { song: await updateSong(db(), ctx, param(event, 'id'), input) }
})
