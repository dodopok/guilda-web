import { isCifraLink } from '~~/server/integrations/cifraclub'
import { createSong, lookupSongKey, songSchema } from '~~/server/services/liturgy'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, songSchema)
  const song = await createSong(db(), ctx, input)
  setResponseStatus(event, 201)
  // Cifra do Cifra Club sem tom: tenta ler o tom original da página.
  if (isCifraLink(song.link) && !song.musicalKey) return lookupSongKey(db(), ctx, song.id)
  return { song }
})
