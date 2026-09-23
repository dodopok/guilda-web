import { z } from 'zod'

// Cliente do Estêvão (estevao-api). Contrato conferido no código-fonte do serviço:
//   GET /api/v1/calendar/:year/:month/:day
//   cabeçalho X-API-Key; preferências em preferences[prayer_book_code] etc.
// Resposta (Calendar::DayPayload): date, liturgical_season, liturgical_color, sunday_name,
// celebration, celebrations[], collect[] ({ text, title, subtitle, ... }),
// readings { first_reading, psalm, psalm_alternative, second_reading, gospel } com
// { reference, content?, alternative?, alternatives? }.

export interface EstevaoConfig {
  url: string
  apiKey: string
  timeoutMs: number
  fetchImpl?: typeof fetch
}

export class EstevaoError extends Error {
  constructor(message: string, public readonly kind: 'not_configured' | 'network' | 'http' | 'invalid_response', public readonly status?: number) {
    super(message)
    this.name = 'EstevaoError'
  }
}

const passage = z.object({
  reference: z.string(),
  content: z.string().optional().nullable(),
  alternative: z.object({ reference: z.string() }).passthrough().optional().nullable(),
  alternatives: z.array(z.object({ reference: z.string() }).passthrough()).optional().nullable(),
}).passthrough()

const celebration = z.object({
  name: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
}).passthrough()

export const dayPayloadSchema = z.object({
  date: z.string(),
  liturgical_season: z.string().optional().nullable(),
  liturgical_color: z.string().optional().nullable(),
  sunday_name: z.string().optional().nullable(),
  week_of_season: z.union([z.number(), z.string()]).optional().nullable(),
  is_sunday: z.boolean().optional().nullable(),
  is_holy_day: z.boolean().optional().nullable(),
  celebration: celebration.optional().nullable(),
  celebrations: z.array(celebration).optional().nullable(),
  collect: z.array(z.object({
    text: z.string(),
    title: z.string().optional().nullable(),
    subtitle: z.string().optional().nullable(),
    module_title: z.string().optional().nullable(),
    celebration_name: z.string().optional().nullable(),
  }).passthrough()).optional().nullable(),
  readings: z.object({
    first_reading: passage.optional().nullable(),
    psalm: passage.optional().nullable(),
    psalm_alternative: passage.optional().nullable(),
    second_reading: passage.optional().nullable(),
    gospel: passage.optional().nullable(),
  }).passthrough().optional().nullable(),
}).passthrough()

export type DayPayload = z.infer<typeof dayPayloadSchema>

export const READING_LABELS: Record<string, string> = {
  first_reading: 'Primeira leitura',
  psalm: 'Salmo',
  psalm_alternative: 'Salmo (alternativo)',
  second_reading: 'Segunda leitura',
  gospel: 'Evangelho',
}

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

// Normaliza a resposta. Textos bíblicos (content) não são guardados: só referências.
export function normalizeDay(payload: DayPayload): LiturgicalSuggestion {
  const readings: LiturgicalSuggestion['readings'] = []
  for (const key of ['first_reading', 'psalm', 'psalm_alternative', 'second_reading', 'gospel'] as const) {
    const p = payload.readings?.[key]
    if (!p?.reference) continue
    const alternatives = [p.alternative?.reference, ...(p.alternatives ?? []).map((a) => a.reference)].filter((x): x is string => Boolean(x))
    readings.push({ key, label: READING_LABELS[key]!, reference: p.reference, alternatives })
  }
  return {
    date: payload.date,
    sundayName: payload.sunday_name ?? null,
    season: payload.liturgical_season ?? null,
    color: payload.liturgical_color ?? null,
    celebration: payload.celebration?.name ?? null,
    celebrations: (payload.celebrations ?? []).map((c) => c.name).filter((x): x is string => Boolean(x)),
    collects: (payload.collect ?? []).map((c) => ({
      title: [c.title, c.subtitle].filter(Boolean).join(' — ') || c.module_title || 'Coleta',
      text: c.text,
    })),
    readings,
  }
}

export function dayPath(date: string, prefs: { prayerBook: string, readingType: string }) {
  const [y, m, d] = date.split('-').map(Number)
  const params = new URLSearchParams()
  params.set('preferences[prayer_book_code]', prefs.prayerBook)
  params.set('preferences[reading_type]', prefs.readingType)
  return `/api/v1/calendar/${y}/${m}/${d}?${params.toString()}`
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
  if (!res.ok) throw new EstevaoError(`O Estêvão respondeu com erro ${res.status}.`, 'http', res.status)
  const json = await res.json().catch(() => null)
  const parsed = dayPayloadSchema.safeParse(json)
  if (!parsed.success) throw new EstevaoError('Resposta do Estêvão em formato inesperado.', 'invalid_response')
  return { path, payload: parsed.data, suggestion: normalizeDay(parsed.data) }
}
