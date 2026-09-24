import type { Ref } from 'vue'
import type { Song } from '~/types'

export interface SongHit { title: string, artist: string, link: string }
export type KeyLookup = { status: 'found', key: string } | { status: 'not_found' | 'unavailable', reason: string }

export const isCifraLink = (link: string | null | undefined) => Boolean(link && /^https:\/\/www\.cifraclub\.com\.br\/[a-z0-9-]+\/[a-z0-9-]+\/$/i.test(link))

const UNAVAILABLE = 'A busca no Cifra Club não respondeu agora. O repertório continua disponível.'

// Busca no Cifra Club enquanto a pessoa digita (a partir de 3 letras, com pausa de 400 ms),
// e cadastro da música escolhida no repertório, com tentativa de ler o tom original.
export function useSongSearch(query: Ref<string>) {
  const { capi } = useChurch()
  const toast = useToast()
  const hits = ref<SongHit[]>([])
  const searching = ref(false)
  const note = ref('')
  let timer: ReturnType<typeof setTimeout> | undefined
  let seq = 0
  watch(query, () => {
    clearTimeout(timer)
    hits.value = []
    note.value = ''
    const v = query.value.trim()
    if (v.length < 3) {
      seq++
      searching.value = false
      return
    }
    timer = setTimeout(async () => {
      const mine = ++seq
      searching.value = true
      try {
        const r = await capi<{ available: boolean, hits: SongHit[] }>(`/songs/search?q=${encodeURIComponent(v)}`)
        if (mine !== seq) return
        hits.value = r.hits
        if (!r.available) note.value = UNAVAILABLE
      } catch {
        if (mine === seq) note.value = UNAVAILABLE
      } finally {
        if (mine === seq) searching.value = false
      }
    }, 400)
  })
  onBeforeUnmount(() => clearTimeout(timer))

  const adding = ref(false)
  async function addHit(h: SongHit): Promise<Song | null> {
    adding.value = true
    try {
      const r = await capi<{ song: Song, keyLookup?: KeyLookup }>('/songs', { method: 'POST', body: { title: h.title, author: h.artist, link: h.link } })
      reportKey(r.song, r.keyLookup)
      return r.song
    } catch (e) {
      toast.error(e)
      return null
    } finally {
      adding.value = false
    }
  }
  function reportKey(song: Song, k?: KeyLookup) {
    if (!k) return
    if (k.status === 'found') toast.ok(`“${song.title}” no repertório, tom original ${song.musicalKey ?? k.key} (lido da cifra).`)
    else toast.ok(`“${song.title}” no repertório. Não deu para ler o tom da cifra: abra o link e digite o tom.`)
  }
  // Nova tentativa de ler o tom original de uma música do repertório com link de cifra.
  const reading = ref<string | null>(null)
  async function readKey(song: Song): Promise<Song | null> {
    reading.value = song.id
    try {
      const r = await capi<{ song: Song, keyLookup: KeyLookup }>(`/songs/${song.id}/key-lookup`, { method: 'POST' })
      if (r.keyLookup.status === 'found') toast.ok(`Tom original de “${song.title}”: ${r.song.musicalKey ?? r.keyLookup.key} (lido da cifra).`)
      else toast.error(`${r.keyLookup.reason} Abra a cifra e digite o tom.`)
      return r.song
    } catch (e) {
      toast.error(e)
      return null
    } finally {
      reading.value = null
    }
  }
  return { hits, searching, note, adding, addHit, reportKey, reading, readKey }
}
