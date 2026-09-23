import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db/client'
import { assignments, duties, importBatches, people, personAliases, qualifications, scheduleMonths, services, slots } from '../db/schema'
import { sha256 } from '../lib/crypto'
import { badRequest } from '../lib/errors'
import { weekdayOfLocalDate, zonedInstant } from '../lib/time'
import { nameKey } from '../lib/text'
import { audit } from './audit'
import { type ChurchContext, requireCoordinator } from './context'

// Importação de um mês da planilha (colunas DATA, MINISTÉRIO, VOLUNTÁRIO), com prévia.
// Regras do mapeamento da descoberta: a data só aparece no início do bloco e é propagada;
// células com vários nomes viram várias designações; nomes não reconhecidos NÃO criam
// pessoas; "?" e células vazias não viram designação; a planilha nunca é alterada.

export const importInputSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  csv: z.string().min(10).max(500_000),
  defaultTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('09:30'),
  resolutions: z.object({
    duties: z.record(z.string(), z.string()).default({}), // chave do rótulo -> dutyId | 'ignore'
    people: z.record(z.string(), z.string()).default({}), // chave do nome -> personId | 'ignore'
  }).default({ duties: {}, people: {} }),
  saveAliases: z.boolean().default(true),
})
export type ImportInput = z.input<typeof importInputSchema>

interface ParsedRow { line: number, date: string | null, label: string, names: string[], rawDate: string }

function detectDelimiter(text: string) {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? ''
  const counts = [',', ';', '\t'].map((d) => [d, first.split(d).length] as const)
  return counts.sort((a, b) => b[1] - a[1])[0]![0]
}

// CSV simples com aspas duplas.
function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        quoted = false
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

function parseDate(raw: string, month: string): string | null {
  const v = raw.trim()
  if (!v) return null
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = v.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
  if (m) {
    const year = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : month.slice(0, 4)
    return `${year}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`
  }
  return 'invalid'
}

function splitNames(cell: string) {
  return cell.split(/,|\/|;|\s+e\s+/i).map((s) => s.trim()).filter(Boolean)
}

export function parseSheet(csv: string, month: string): ParsedRow[] {
  const rows = parseCsv(csv.replace(/^\uFEFF/, ''), detectDelimiter(csv))
  // Cabeçalho opcional: DATA + MINISTÉRIO/FUNÇÃO + VOLUNTÁRIO/NOME. Sem cabeçalho, as
  // colunas são lidas na ordem data; função; nome.
  const isLabel = (c: string) => /^(ministerio|funcao)/.test(nameKey(c))
  const isName = (c: string) => /^(voluntari|nome|pessoa)/.test(nameKey(c))
  const headerIdx = rows.findIndex((r) => r.some((c) => nameKey(c) === 'data') && r.some(isLabel))
  const header = rows[headerIdx] ?? []
  const pick = (test: (c: string) => boolean, fallback: number) => {
    const i = header.findIndex(test)
    return i >= 0 ? i : fallback
  }
  const iDate = pick((c) => nameKey(c) === 'data', 0)
  const iLabel = pick(isLabel, 1)
  const iNames = pick(isName, 2)
  const out: ParsedRow[] = []
  let current: string | null = null
  let currentRaw = ''
  rows.forEach((r, idx) => {
    if (idx <= headerIdx) return
    const rawDate = (r[iDate] ?? '').trim()
    const label = (r[iLabel] ?? '').trim()
    if (rawDate) {
      current = parseDate(rawDate, month)
      currentRaw = rawDate
    }
    if (!label) return
    out.push({ line: idx + 1, date: current, rawDate: currentRaw, label, names: splitNames(r[iNames] ?? '') })
  })
  return out
}

function labelKey(label: string) {
  return nameKey(label)
}

// Compara rótulos da planilha com funções: "LITURGIA - ABERTURA" -> "abertura".
function matchDuty(label: string, list: { id: string, name: string, key: string }[]) {
  const key = labelKey(label)
  const direct = list.find((d) => d.key === key)
  if (direct) return direct
  const tail = key.split(/\s*-\s*/).pop() ?? key
  const byTail = list.filter((d) => d.key === tail)
  return byTail.length === 1 ? byTail[0] : undefined
}

export async function previewImport(db: Db, ctx: ChurchContext, raw: ImportInput) {
  requireCoordinator(ctx)
  const input = importInputSchema.parse(raw)
  const rows = parseSheet(input.csv, input.month)
  if (!rows.length) throw badRequest('empty_import', 'Não encontrei linhas no formato data; função; nome.')
  const dutyList = (await db.select().from(duties).where(eq(duties.churchId, ctx.church.id))).map((d) => ({ id: d.id, name: d.name, key: nameKey(d.name) }))
  const peopleList = await db.select().from(people).where(and(eq(people.churchId, ctx.church.id), eq(people.status, 'active')))
  const aliases = await db.select().from(personAliases).where(eq(personAliases.churchId, ctx.church.id))
  const aliasMap = new Map(aliases.map((a) => [a.aliasKey, a.personId]))
  const nameOf = new Map(peopleList.map((p) => [p.id, p.displayName]))

  function resolvePerson(rawName: string) {
    const key = nameKey(rawName)
    const decided = input.resolutions.people[key]
    if (decided === 'ignore') return { status: 'ignored' as const, key }
    if (decided && nameOf.has(decided)) return { status: 'ok' as const, personId: decided, key }
    const exact = peopleList.filter((p) => p.nameKey === key)
    if (exact.length === 1) return { status: 'ok' as const, personId: exact[0]!.id, key }
    const alias = aliasMap.get(key)
    if (alias && nameOf.has(alias)) return { status: 'ok' as const, personId: alias, key }
    // Só o primeiro nome (ou grafia parcial): sugere, mas exige confirmação.
    const partial = peopleList.filter((p) => p.nameKey.split(' ')[0] === key.split(' ')[0])
    if (exact.length > 1 || partial.length > 1) return { status: 'ambiguous' as const, key, candidates: (exact.length > 1 ? exact : partial).map((p) => ({ id: p.id, name: p.displayName })) }
    if (partial.length === 1) return { status: 'suggested' as const, key, candidates: [{ id: partial[0]!.id, name: partial[0]!.displayName }] }
    return { status: 'unknown' as const, key }
  }

  const out = rows.map((r) => {
    const issues: string[] = []
    if (!r.date) issues.push('sem data no bloco')
    else if (r.date === 'invalid') issues.push(`data ilegível: "${r.rawDate}"`)
    else if (!r.date.startsWith(input.month)) issues.push(`data fora do mês (${r.date})`)
    const lk = labelKey(r.label)
    const decidedDuty = input.resolutions.duties[lk]
    const duty = decidedDuty === 'ignore' ? undefined : decidedDuty ? dutyList.find((d) => d.id === decidedDuty) : matchDuty(r.label, dutyList)
    if (decidedDuty === 'ignore') issues.push('função ignorada')
    else if (!duty) issues.push('função não reconhecida')
    const names = r.names.filter((n) => n !== '?' && n !== '-' && n !== '—')
    if (!names.length) issues.push(r.names.length ? 'responsável indefinido (?)' : 'célula vazia')
    const persons = names.map((n) => ({ raw: n, ...resolvePerson(n) }))
    return {
      line: r.line,
      date: r.date && r.date !== 'invalid' ? r.date : null,
      label: r.label,
      labelKey: lk,
      duty: duty ? { id: duty.id, name: duty.name } : null,
      dutyIgnored: decidedDuty === 'ignore',
      people: persons.map((p) => ({
        raw: p.raw,
        key: p.key,
        status: p.status,
        personId: 'personId' in p ? p.personId : null,
        personName: 'personId' in p && p.personId ? nameOf.get(p.personId) ?? null : null,
        candidates: 'candidates' in p ? p.candidates : [],
      })),
      issues,
    }
  })
  const importable = out.filter((r) => r.date?.startsWith(input.month) && r.duty)
  const assignmentCount = importable.reduce((n, r) => n + r.people.filter((p) => p.status === 'ok').length, 0)
  const dates = [...new Set(importable.map((r) => r.date!))].sort()
  return {
    month: input.month,
    rows: out,
    summary: {
      rows: out.length,
      dates,
      assignments: assignmentCount,
      unknownDuties: [...new Set(out.filter((r) => !r.duty && !r.dutyIgnored).map((r) => r.label))],
      unresolvedPeople: [...new Map(out.flatMap((r) => r.people).filter((p) => p.status !== 'ok' && p.status !== 'ignored').map((p) => [p.key, p])).values()],
      nonSundayDates: dates.filter((d) => weekdayOfLocalDate(d) !== 0),
    },
    duties: dutyList.map((d) => ({ id: d.id, name: d.name })),
    people: peopleList.map((p) => ({ id: p.id, name: p.displayName })),
  }
}

// Aplica a importação. Idempotente: a mesma planilha (mesmo conteúdo e mês) não é
// aplicada duas vezes, e designações já existentes não são duplicadas.
export interface ImportStats { servicesCreated: number, slotsCreated: number, assignmentsCreated: number, alreadyAssigned: number, exceptional: number, skippedRows: number, aliasesSaved: number }

export async function applyImport(db: Db, ctx: ChurchContext, raw: ImportInput): Promise<ImportStats & { alreadyImported: boolean }> {
  requireCoordinator(ctx)
  const input = importInputSchema.parse(raw)
  const sourceKey = sha256(`${input.month}\n${input.csv.trim()}`)
  const previous = await db.query.importBatches.findFirst({ where: and(eq(importBatches.churchId, ctx.church.id), eq(importBatches.sourceKey, sourceKey)) })
  if (previous) return { alreadyImported: true, ...(previous.summary as unknown as ImportStats) }
  const sm = await db.query.scheduleMonths.findFirst({ where: and(eq(scheduleMonths.churchId, ctx.church.id), eq(scheduleMonths.month, input.month)) })
  if (sm?.status === 'published') throw badRequest('month_published', 'A escala deste mês já foi publicada. Importe apenas em mês ainda em rascunho.')
  const preview = await previewImport(db, ctx, input)

  return db.transaction(async (tx) => {
    const stats: ImportStats = { servicesCreated: 0, slotsCreated: 0, assignmentsCreated: 0, alreadyAssigned: 0, exceptional: 0, skippedRows: 0, aliasesSaved: 0 }
    const quals = await tx.select().from(qualifications).where(eq(qualifications.churchId, ctx.church.id))
    const qualified = new Set(quals.map((q) => `${q.personId}:${q.dutyId}`))
    const serviceByDate = new Map<string, string>()
    for (const row of preview.rows) {
      const okPeople = row.people.filter((p) => p.status === 'ok' && p.personId)
      if (!row.date || !row.date.startsWith(input.month) || !row.duty || !okPeople.length) {
        stats.skippedRows++
        continue
      }
      let serviceId = serviceByDate.get(row.date)
      if (!serviceId) {
        const startsAt = zonedInstant(row.date, input.defaultTime, ctx.church.timezone)
        const existing = await tx.query.services.findFirst({ where: and(eq(services.churchId, ctx.church.id), eq(services.startsAt, startsAt)) })
        if (existing) {
          serviceId = existing.id
        } else {
          const [created] = await tx.insert(services).values({
            churchId: ctx.church.id, startsAt, endsAt: new Date(startsAt.getTime() + 120 * 60_000), localDate: row.date, month: input.month,
            title: weekdayOfLocalDate(row.date) === 0 ? 'Culto dominical' : 'Culto', location: ctx.church.defaultLocation, kind: 'regular',
          }).returning()
          serviceId = created!.id
          stats.servicesCreated++
        }
        serviceByDate.set(row.date, serviceId)
      }
      let slot = await tx.query.slots.findFirst({ where: and(eq(slots.churchId, ctx.church.id), eq(slots.serviceId, serviceId), eq(slots.dutyId, row.duty.id)) })
      if (!slot) {
        const [created] = await tx.insert(slots).values({ churchId: ctx.church.id, serviceId, dutyId: row.duty.id, requiredCount: okPeople.length, position: 100 + stats.slotsCreated }).returning()
        slot = created!
        stats.slotsCreated++
      }
      const inSlot = await tx.select().from(assignments).where(eq(assignments.slotId, slot.id))
      const needed = new Set([...inSlot.map((a) => a.personId), ...okPeople.map((p) => p.personId!)]).size
      if (needed > slot.requiredCount) await tx.update(slots).set({ requiredCount: needed }).where(eq(slots.id, slot.id))
      for (const p of okPeople) {
        const isQ = qualified.has(`${p.personId}:${row.duty.id}`)
        const inserted = await tx.insert(assignments).values({
          churchId: ctx.church.id, slotId: slot.id, personId: p.personId!, createdByAccountId: ctx.accountId,
          exceptional: !isQ, exceptionReason: isQ ? null : 'Importado da planilha sem habilitação cadastrada', exceptionByAccountId: isQ ? null : ctx.accountId,
        }).onConflictDoNothing({ target: [assignments.slotId, assignments.personId] }).returning({ id: assignments.id })
        if (inserted.length) {
          stats.assignmentsCreated++
          if (!isQ) stats.exceptional++
        } else {
          stats.alreadyAssigned++
        }
      }
    }
    if (input.saveAliases) {
      const chosen = Object.entries(input.resolutions.people).filter(([, id]) => id !== 'ignore')
      if (chosen.length) {
        const valid = await tx.select({ id: people.id }).from(people).where(and(eq(people.churchId, ctx.church.id), inArray(people.id, chosen.map(([, id]) => id))))
        const ok = new Set(valid.map((v) => v.id))
        for (const [key, personId] of chosen) {
          if (!ok.has(personId)) continue
          const r = await tx.insert(personAliases).values({ churchId: ctx.church.id, personId, aliasKey: key }).onConflictDoNothing().returning({ id: personAliases.id })
          stats.aliasesSaved += r.length
        }
      }
    }
    await tx.insert(importBatches).values({ churchId: ctx.church.id, sourceKey, month: input.month, summary: { ...stats }, createdByAccountId: ctx.accountId })
    await audit(tx, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'import.applied', entityType: 'schedule_month', entityId: input.month, data: { ...stats } })
    return { alreadyImported: false, ...stats }
  })
}
