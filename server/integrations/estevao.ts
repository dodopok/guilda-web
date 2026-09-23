import { z } from 'zod'

// Cliente do Estêvão, API v2 (contrato em /api-docs/v2/swagger.yaml da instância):
//   GET /api/v2/days/:date?book=…&service=eucharist&reading_type=…&include=…
//   cabeçalho X-API-Key; resposta { data, meta }; erros application/problem+json com `code`.
// Pedimos só o que o roteiro usa: referências das leituras (sem texto bíblico), alternativas,
// coletas com texto e celebrações. `book` é obrigatório na v2 (não há padrão silencioso).

export interface EstevaoConfig {
  url: string
  apiKey: string
  timeoutMs: number
  fetchImpl?: typeof fetch
}

export class EstevaoError extends Error {
  constructor(message: string, public readonly kind: 'not_configured' | 'network' | 'http' | 'invalid_response', public readonly status?: number, public readonly code?: string) {
    super(message)
    this.name = 'EstevaoError'
  }
}

const alternative = z.union([z.string(), z.object({ reference: z.string() }).passthrough()])
const reading = z.object({
  slot: z.string(),
  reference: z.string(),
  alternatives: z.array(alternative).optional().nullable(),
}).passthrough()

const celebration = z.object({
  name: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
}).passthrough()

export const dayPayloadSchema = z.object({
  data: z.object({
    date: z.string(),
    season: z.object({ slug: z.string().optional().nullable(), name: z.string().optional().nullable() }).passthrough().optional().nullable(),
    color: z.string().optional().nullable(),
    sunday_name: z.string().optional().nullable(),
    week_of_season: z.union([z.number(), z.string()]).optional().nullable(),
    is_sunday: z.boolean().optional().nullable(),
    is_holy_day: z.boolean().optional().nullable(),
    celebration: celebration.optional().nullable(),
    celebrations: z.array(celebration).optional().nullable(),
    collect: z.array(z.object({
      text: z.string().optional().nullable(),
      title: z.string().optional().nullable(),
      kind: z.string().optional().nullable(),
    }).passthrough()).optional().nullable(),
    readings: z.array(reading).optional().nullable(),
  }).passthrough(),
  meta: z.object({ prayer_book: z.string().optional().nullable() }).passthrough().optional().nullable(),
}).passthrough()

export type DayPayload = z.infer<typeof dayPayloadSchema>

export const READING_LABELS: Record<string, string> = {
  first_reading: 'Primeira leitura',
  old_testament: 'Primeira leitura',
  psalm: 'Salmo',
  psalm_alternative: 'Salmo (alternativo)',
  second_reading: 'Segunda leitura',
  epistle: 'Segunda leitura',
  gospel: 'Evangelho',
}

// A documentação da v2 cita cores em inglês; a instância responde em português. Aceita as duas.
const COLOR_PT: Record<string, string> = { green: 'verde', purple: 'roxo', violet: 'roxo', white: 'branco', gold: 'dourado', red: 'vermelho', rose: 'rosa', pink: 'rosa', blue: 'azul', black: 'preto' }

export interface LiturgicalSuggestion {
  date: string
  sundayName: string | null
  season: string | null
  color: string | null
  celebration: string | null
  celebrations: string[]
  collects: { title: string, text: string }[]
  readings: { key: string, label: string, reference: string, alternatives: string[] }[]
}

// Normaliza a resposta. Textos bíblicos nunca são pedidos nem guardados: só referências.
export function normalizeDay(payload: DayPayload): LiturgicalSuggestion {
  const d = payload.data
  const readings = (d.readings ?? []).filter((r) => r.reference).map((r) => ({
    key: r.slot,
    label: READING_LABELS[r.slot] ?? 'Leitura',
    reference: r.reference,
    alternatives: (r.alternatives ?? []).map((a) => (typeof a === 'string' ? a : a.reference)).filter(Boolean),
  }))
  const color = d.color ? (COLOR_PT[d.color.toLowerCase()] ?? d.color) : null
  return {
    date: d.date,
    sundayName: d.sunday_name ?? null,
    season: d.season?.name ?? null,
    color,
    celebration: d.celebration?.name ?? null,
    celebrations: (d.celebrations ?? []).map((c) => c.name).filter((x): x is string => Boolean(x)),
    collects: (d.collect ?? []).filter((c) => c.text).map((c) => ({ title: c.title || c.kind || 'Coleta', text: c.text! })),
    readings,
  }
}

export function dayPath(date: string, prefs: { prayerBook: string, readingType: string }) {
  const params = new URLSearchParams({
    book: prefs.prayerBook,
    service: 'eucharist',
    reading_type: prefs.readingType,
    include: 'readings,readings.alternatives,collect.text,celebrations',
  })
  return `/api/v2/days/${date}?${params.toString()}`
}

// Mensagens em português para os códigos estáveis da v2.
const PROBLEM_TEXT: Record<string, string> = {
  // A instância responde MISSING_API_KEY também para chave inválida; nós sempre enviamos uma.
  MISSING_API_KEY: 'O Estêvão recusou a chave de API (inválida ou revogada).',
  INVALID_API_KEY: 'A chave de API do Estêvão foi recusada.',
  UNKNOWN_PRAYER_BOOK: 'O livro de oração configurado não existe no Estêvão.',
  MISSING_PRAYER_BOOK: 'Falta escolher o livro de oração.',
  RATE_LIMITED: 'O Estêvão pediu para esperar um pouco (limite de consultas). Tente de novo em alguns minutos.',
  INVALID_DATE: 'O Estêvão não reconheceu a data do culto.',
}

export async function fetchLiturgicalDay(config: EstevaoConfig, date: string, prefs: { prayerBook: string, readingType: string }) {
  if (!config.url || !config.apiKey) {
    throw new EstevaoError('Integração com o Estêvão não configurada (ESTEVAO_API_URL e ESTEVAO_API_KEY).', 'not_configured')
  }
  const path = dayPath(date, prefs)
  const doFetch = config.fetchImpl ?? fetch
  let res: Response
  try {
    res = await doFetch(`${config.url}${path}`, {
      headers: { 'X-API-Key': config.apiKey, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(config.timeoutMs),
    })
  } catch (err) {
    throw new EstevaoError(`Não foi possível falar com o Estêvão: ${(err as Error).message}`, 'network')
  }
  if (!res.ok) {
    const problem = await res.json().catch(() => null) as { code?: string } | null
    const code = typeof problem?.code === 'string' ? problem.code : undefined
    const text = (code && PROBLEM_TEXT[code]) || (res.status === 401 || res.status === 403 ? PROBLEM_TEXT.INVALID_API_KEY! : `O Estêvão respondeu com erro ${res.status}.`)
    throw new EstevaoError(text, 'http', res.status, code)
  }
  const json = await res.json().catch(() => null)
  const parsed = dayPayloadSchema.safeParse(json)
  if (!parsed.success) throw new EstevaoError('Resposta do Estêvão em formato inesperado.', 'invalid_response')
  return { path, payload: parsed.data, suggestion: normalizeDay(parsed.data) }
}

// Catálogo de livros de oração (não exige `book`). Guardado em memória por uma hora:
// muda raramente e evita uma consulta a cada abertura das Configurações.
const bookSchema = z.object({ data: z.array(z.object({ code: z.string(), name: z.string().optional().nullable() }).passthrough()) }).passthrough()
let booksCache: { at: number, key: string, list: { code: string, name: string }[] } | null = null
export async function fetchPrayerBooks(config: EstevaoConfig, lang = 'pt-BR') {
  if (!config.url || !config.apiKey) throw new EstevaoError('Integração com o Estêvão não configurada (ESTEVAO_API_URL e ESTEVAO_API_KEY).', 'not_configured')
  const key = `${config.url}|${lang}`
  if (booksCache && booksCache.key === key && Date.now() - booksCache.at < 3600_000) return booksCache.list
  let res: Response
  try {
    res = await (config.fetchImpl ?? fetch)(`${config.url}/api/v2/prayer-books?lang=${encodeURIComponent(lang)}`, {
      headers: { 'X-API-Key': config.apiKey, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(config.timeoutMs),
    })
  } catch (err) {
    throw new EstevaoError(`Não foi possível falar com o Estêvão: ${(err as Error).message}`, 'network')
  }
  if (!res.ok) throw new EstevaoError(`O Estêvão respondeu com erro ${res.status}.`, 'http', res.status)
  const parsed = bookSchema.safeParse(await res.json().catch(() => null))
  if (!parsed.success) throw new EstevaoError('Resposta do Estêvão em formato inesperado.', 'invalid_response')
  const list = parsed.data.data.map((b) => ({ code: b.code, name: b.name || b.code }))
  booksCache = { at: Date.now(), key, list }
  return list
}
