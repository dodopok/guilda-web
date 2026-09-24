import { z } from 'zod'

// Busca de músicas no Cifra Club, usando o mesmo serviço de sugestões da caixa de busca
// do site (não é uma API oficial nem documentada). Só enviamos o que a pessoa digitou e
// só guardamos título, artista e o link da cifra. O tom não vem nessa busca: tentamos lê-lo
// da página da cifra (só o campo "tom", nada de letra ou acordes); se a página recusar,
// quem escolhe digita o tom olhando o link.

export interface SongSearchConfig {
  url: string
  // Endereço das páginas de cifra (trocado por um simulado nos testes). Vazio desliga a leitura do tom.
  pageBase?: string
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

// Link de cifra aceito: só o domínio do Cifra Club, com artista e música em formato de slug.
const CIFRA_LINK = /^https:\/\/www\.cifraclub\.com\.br\/([a-z0-9-]+)\/([a-z0-9-]+)\/$/i
export const isCifraLink = (link: string | null | undefined) => Boolean(link && CIFRA_LINK.test(link))

const KEY = /^([A-G](?:#|b)?m?)$/
// Lê só o tom (ex.: "tom: G") do trecho #cifra_tom da página. Nada mais é aproveitado.
export function extractKey(html: string): string | null {
  const at = html.search(/id=["']cifra_tom["']/i)
  if (at < 0) return null
  const end = html.indexOf('</span>', at)
  const chunk = html.slice(at, end > at ? end : at + 400).replace(/<[^>]*>/g, ' ').replace(/^[^>]*>/, ' ')
  const m = chunk.match(/tom\s*:?\s*([A-G](?:#|b)?m?)(?![a-z#])/i)
  const key = m?.[1] ? m[1].charAt(0).toUpperCase() + m[1].slice(1) : null
  return key && KEY.test(key) ? key : null
}

export type KeyLookup = { status: 'found', key: string } | { status: 'not_found' | 'unavailable', reason: string }
const keyCache = new Map<string, { at: number, result: KeyLookup }>()

export async function lookupCifraKey(config: SongSearchConfig, link: string): Promise<KeyLookup> {
  const m = link.match(CIFRA_LINK)
  if (!m) return { status: 'not_found', reason: 'O link não é de uma cifra do Cifra Club.' }
  if (!config.pageBase) return { status: 'unavailable', reason: 'Leitura do tom desligada nesta instalação.' }
  const cached = keyCache.get(link)
  // Tom achado vale um dia; falha é tentada de novo depois de uma hora.
  if (cached && Date.now() - cached.at < (cached.result.status === 'found' ? 86400_000 : 3600_000)) return cached.result
  let result: KeyLookup
  try {
    const res = await (config.fetchImpl ?? fetch)(`${config.pageBase}/${m[1]}/${m[2]}/`, {
      headers: { 'Accept': 'text/html', 'Accept-Language': 'pt-BR,pt;q=0.9' },
      signal: AbortSignal.timeout(config.timeoutMs),
    })
    if (!res.ok) {
      result = { status: 'unavailable', reason: res.status === 403 ? 'O Cifra Club recusou a leitura da página.' : `O Cifra Club respondeu com erro ${res.status}.` }
    } else {
      const key = extractKey((await res.text()).slice(0, 2_000_000))
      result = key ? { status: 'found', key } : { status: 'not_found', reason: 'A página da cifra não informa o tom.' }
    }
  } catch (err) {
    result = { status: 'unavailable', reason: `Não foi possível abrir a cifra: ${(err as Error).message}` }
  }
  keyCache.set(link, { at: Date.now(), result })
  if (keyCache.size > 1000) keyCache.delete(keyCache.keys().next().value!)
  return result
}
