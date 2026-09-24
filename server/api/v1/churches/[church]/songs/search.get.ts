import { z } from 'zod'
import { searchSongs } from '~~/server/services/liturgy'

// Busca no Cifra Club (título, artista e link). Sem a busca, devolve available: false
// e o motivo; o repertório da igreja continua funcionando.
export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const { q } = query(event, z.object({ q: z.string().trim().min(2).max(80) }))
  rateLimit(event, 'song-search', 60, 60_000)
  return searchSongs(db(), ctx, q)
})
