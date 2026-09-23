// Datas sempre no fuso da igreja, nunca no do aparelho.
const cache = new Map<string, Intl.DateTimeFormat>()
function fmt(tz: string, opts: Intl.DateTimeFormatOptions) {
  const key = tz + JSON.stringify(opts)
  let f = cache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, ...opts })
    cache.set(key, f)
  }
  return f
}

type D = string | Date
const toDate = (d: D) => (typeof d === 'string' ? new Date(d) : d)

export function localDateKey(d: D, tz: string) {
  const parts = fmt(tz, { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(toDate(d))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function weekdayShort(d: D, tz: string) {
  return fmt(tz, { weekday: 'short' }).format(toDate(d)).replace('.', '')
}
export function weekdayLong(d: D, tz: string) {
  return fmt(tz, { weekday: 'long' }).format(toDate(d))
}
export function dayNumber(d: D, tz: string) {
  return fmt(tz, { day: 'numeric' }).format(toDate(d))
}
export function monthShort(d: D, tz: string) {
  return fmt(tz, { month: 'short' }).format(toDate(d)).replace('.', '')
}
// "domingo, 27 de setembro"
export function longDate(d: D, tz: string) {
  return fmt(tz, { weekday: 'long', day: 'numeric', month: 'long' }).format(toDate(d))
}
// "27 de setembro"
export function dayMonth(d: D, tz: string) {
  return fmt(tz, { day: 'numeric', month: 'long' }).format(toDate(d))
}
// "27/09"
export function shortDate(d: D, tz: string) {
  return fmt(tz, { day: '2-digit', month: '2-digit' }).format(toDate(d))
}
// "9h30" / "19h"
export function time(d: D, tz: string) {
  const [h, m] = fmt(tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(toDate(d)).split(':')
  return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}`
}
export function hhmm(hm: string) {
  const [h, m] = hm.split(':')
  return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}`
}
export function dateTime(d: D, tz: string) {
  return `${shortDate(d, tz)} às ${time(d, tz)}`
}

// "hoje", "amanhã", "em 3 dias", "há 2 dias"
export function relativeDay(d: D, tz: string, now = new Date()) {
  const a = localDateKey(d, tz)
  const b = localDateKey(now, tz)
  const diff = Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400_000)
  if (diff === 0) return 'hoje'
  if (diff === 1) return 'amanhã'
  if (diff === -1) return 'ontem'
  if (diff > 1 && diff < 7) return `em ${diff} dias`
  if (diff >= 7 && diff < 14) return 'na próxima semana'
  if (diff < -1) return `há ${-diff} dias`
  return `em ${diff} dias`
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export function monthLabel(month: string) {
  const [y, m] = month.split('-').map(Number)
  return `${MONTHS[m! - 1]} de ${y}`
}
export function monthName(month: string) {
  const [, m] = month.split('-').map(Number)
  return MONTHS[m! - 1] ?? ''
}
export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number)
  const idx = y! * 12 + (m! - 1) + delta
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`
}
export function currentMonth(tz: string) {
  return localDateKey(new Date(), tz).slice(0, 7)
}
// Converte data e hora locais da igreja em ISO (para enviar à API).
export function zonedToIso(date: string, hm: string, tz: string) {
  const guess = new Date(`${date}T${hm}:00Z`)
  const asLocal = fmt(tz, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(guess)
  const get = (t: string) => Number(asLocal.find((p) => p.type === t)?.value)
  const shown = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  const offset = shown - guess.getTime()
  return new Date(guess.getTime() - offset).toISOString()
}
export function isoToLocalParts(d: D, tz: string) {
  const date = localDateKey(d, tz)
  const [h, m] = fmt(tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(toDate(d)).split(':')
  return { date, time: `${h}:${m}` }
}

// "hoje · 08:40" / "qui 24/09 · 19:00"
export function stamp(d: D, tz: string, now = new Date()) {
  const day = localDateKey(d, tz) === localDateKey(now, tz) ? 'hoje' : `${weekdayShort(d, tz)} ${shortDate(d, tz)}`
  return `${day} · ${fmt(tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(toDate(d))}`
}
