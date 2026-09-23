import { listSongs } from '~~/server/services/liturgy'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return { songs: await listSongs(db(), ctx) }
})
