import { TZDate } from '@date-fns/tz'

// Todas as datas "de calendário" (dia do culto, mês da escala, dia do lembrete) são
// calculadas no fuso da igreja; o banco guarda instantes em UTC.

export function zonedInstant(localDate: string, time: string, timeZone: string): Date {
  const [y, m, d] = localDate.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const zoned = TZDate.tz(timeZone, y!, m! - 1, d!, hh!, mm!, 0, 0)
  return new Date(zoned.getTime())
}

export interface LocalParts {
  date: string // YYYY-MM-DD
  month: string // YYYY-MM
  time: string // HH:MM
  weekday: number // 0 = domingo
}

const pad = (n: number) => String(n).padStart(2, '0')

export function localParts(instant: Date, timeZone: string): LocalParts {
  const z = new TZDate(instant.getTime(), timeZone)
  const date = `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}`
  return {
    date,
    month: date.slice(0, 7),
    time: `${pad(z.getHours())}:${pad(z.getMinutes())}`,
    weekday: z.getDay(),
  }
}

export function addDaysToLocalDate(localDate: string, days: number): string {
  const [y, m, d] = localDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days))
  return dt.toISOString().slice(0, 10)
}

export function weekdayOfLocalDate(localDate: string): number {
  const [y, m, d] = localDate.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()
}

export function daysInMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate()
  return Array.from({ length: last }, (_, i) => `${month}-${pad(i + 1)}`)
}

export function monthBounds(month: string, timeZone: string): { start: Date, end: Date } {
  const [y, m] = month.split('-').map(Number)
  const next = m === 12 ? `${y! + 1}-01` : `${y}-${pad(m! + 1)}`
  return { start: zonedInstant(`${month}-01`, '00:00', timeZone), end: zonedInstant(`${next}-01`, '00:00', timeZone) }
}

// Instantes em que o lembrete semanal deveria ter disparado, do mais recente ao mais
// antigo, dentro do intervalo [from, to].
export function weeklyOccurrences(weekday: number, time: string, timeZone: string, from: Date, to: Date): Date[] {
  const result: Date[] = []
  let cursor = localParts(to, timeZone).date
  for (let i = 0; i < 400; i++) {
    if (weekdayOfLocalDate(cursor) === weekday) {
      const instant = zonedInstant(cursor, time, timeZone)
      if (instant <= to && instant >= from) result.push(instant)
      if (instant < from) break
    }
    cursor = addDaysToLocalDate(cursor, -1)
  }
  return result
}

export function nextWeeklyOccurrence(weekday: number, time: string, timeZone: string, after: Date): Date {
  let cursor = localParts(after, timeZone).date
  for (let i = 0; i < 15; i++) {
    if (weekdayOfLocalDate(cursor) === weekday) {
      const instant = zonedInstant(cursor, time, timeZone)
      if (instant > after) return instant
    }
    cursor = addDaysToLocalDate(cursor, 1)
  }
  throw new Error('Não foi possível calcular o próximo lembrete.')
}

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export function weekdayName(n: number): string {
  return WEEKDAYS[n] ?? ''
}

export function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTHS[m! - 1]} de ${y}`
}

// "domingo, 20/09 às 9h30"
export function formatServiceDate(instant: Date, timeZone: string): string {
  const p = localParts(instant, timeZone)
  const [, mm, dd] = p.date.split('-')
  return `${weekdayName(p.weekday)}, ${dd}/${mm} às ${formatTime(p.time)}`
}

export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':')
  return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}`
}

export function formatDateShort(instant: Date, timeZone: string): string {
  const p = localParts(instant, timeZone)
  const [, mm, dd] = p.date.split('-')
  return `${dd}/${mm}`
}
