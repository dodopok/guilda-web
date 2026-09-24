import { lookupSongKey } from '~~/server/services/liturgy'

// Tenta de novo ler o tom original na página da cifra.
export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  rateLimit(event, 'song-key', 30, 60_000)
  return lookupSongKey(db(), ctx, param(event, 'id'))
})
