import { z } from 'zod'

// Busca de músicas no Cifra Club, usando o mesmo serviço de sugestões da caixa de busca
// do site (não é uma API oficial nem documentada). Só enviamos o que a pessoa digitou e
// só guardamos título, artista e o link da cifra. O tom não vem nessa busca: a página da
// cifra bloqueia servidores e seu conteúdo (letra e acordes) tem direitos autorais, por
// isso o tom é digitado por quem escolhe, olhando o link.

export interface SongSearchConfig {
  url: string
  timeoutMs: number
  fetchImpl?: typeof fetch
}

export interface SongHit { title: string, artist: string, link: string }

export class SongSearchError extends Error {
  constructor(message: string, public readonly kind: 'disabled' | 'network' | 'http' | 'invalid_response') {
    super(message)
    this.name = 'SongSearchError'
  }
}

const doc = z.object({
  tipo: z.union([z.string(), z.number()]).optional().nullable(),
  art: z.string().optional().nullable(),
  txt: z.string().optional().nullable(),
  dns: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
}).passthrough()
export const searchPayloadSchema = z.object({ response: z.object({ docs: z.array(doc) }).passthrough() }).passthrough()

const SLUG = /^[a-z0-9-]+$/i

// Só músicas (tipo 2), com endereço montado a partir de partes seguras.
export function normalizeHits(payload: z.infer<typeof searchPayloadSchema>, limit = 8): SongHit[] {
  const out: SongHit[] = []
  for (const d of payload.response.docs) {
    if (String(d.tipo ?? '') !== '2' || !d.txt || !d.art || !d.dns || !d.url) continue
    if (!SLUG.test(d.dns) || !SLUG.test(d.url)) continue
    out.push({ title: d.txt.trim().slice(0, 200), artist: d.art.trim().slice(0, 200), link: `https://www.cifraclub.com.br/${d.dns}/${d.url}/` })
    if (out.length >= limit) break
  }
  return out
}

const cache = new Map<string, { at: number, hits: SongHit[] }>()

export async function searchCifraClub(config: SongSearchConfig, query: string): Promise<SongHit[]> {
  if (!config.url) throw new SongSearchError('Busca no Cifra Club desligada nesta instalação.', 'disabled')
  const q = query.trim().replace(/\s+/g, ' ').slice(0, 80)
  if (q.length < 2) return []
  const key = q.toLowerCase()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 600_000) return hit.hits
  let res: Response
  try {
    res = await (config.fetchImpl ?? fetch)(`${config.url}/?${new URLSearchParams({ q, wt: 'json' }).toString()}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(config.timeoutMs),
    })
  } catch (err) {
    throw new SongSearchError(`Não foi possível buscar no Cifra Club: ${(err as Error).message}`, 'network')
  }
  if (!res.ok) throw new SongSearchError(`O Cifra Club respondeu com erro ${res.status}.`, 'http')
  const parsed = searchPayloadSchema.safeParse(await res.json().catch(() => null))
  if (!parsed.success) throw new SongSearchError('Resposta do Cifra Club em formato inesperado.', 'invalid_response')
  const hits = normalizeHits(parsed.data)
  cache.set(key, { at: Date.now(), hits })
  if (cache.size > 500) cache.delete(cache.keys().next().value!)
  return hits
}
