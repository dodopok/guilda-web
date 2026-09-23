import { sql } from 'drizzle-orm'
import { afterAll, beforeEach } from 'vitest'
import { closeDb, getDb, type Db } from '../server/db/client'
import { accounts, churches, consents, duties, ministries, people, qualifications, whatsappChannels } from '../server/db/schema'
import { hashPassword } from '../server/lib/crypto'
import { nameKey } from '../server/lib/text'
import type { ChurchContext, Role } from '../server/services/context'
import { createService } from '../server/services/worship'

export function useDb(): () => Db {
  beforeEach(async () => {
    await truncateAll(getDb())
  })
  afterAll(async () => {
    await closeDb()
  })
  return () => getDb()
}

export async function truncateAll(db: Db) {
  const res = await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public'`)
  const names = res.rows.map((r) => `"${r.tablename}"`).join(', ')
  if (names) await db.execute(sql.raw(`truncate ${names} restart identity cascade`))
}

let phoneSeq = 1000
function nextPhone() {
  phoneSeq++
  return `+55519${String(phoneSeq).padStart(8, '0')}`
}

export interface PersonFixture {
  id: string
  accountId: string | null
  displayName: string
  phone: string | null
  ctx: ChurchContext
}

export async function makeChurch(db: Db, slug: string, opts: { withAccounts?: boolean } = {}) {
  const [church] = await db.insert(churches).values({ slug, name: `Igreja ${slug}`, timezone: 'America/Sao_Paulo', defaultLocation: 'Salão principal' }).returning()
  await db.insert(whatsappChannels).values({ churchId: church!.id, mode: 'simulation' })
  const ms: Record<string, string> = {}
  for (const [i, name] of ['Liturgia', 'Louvor', 'Mídia', 'Café'].entries()) {
    const [m] = await db.insert(ministries).values({ churchId: church!.id, name, position: i }).returning()
    ms[name] = m!.id
  }
  const d: Record<string, string> = {}
  const dutyDefs = [
    { key: 'abertura', ministry: 'Liturgia', name: 'Abertura', kind: 'general', arrival: 20 },
    { key: 'leitura', ministry: 'Liturgia', name: 'Leitura', kind: 'reading', required: 2, arrival: 20 },
    { key: 'sermao', ministry: 'Liturgia', name: 'Sermão', kind: 'sermon', arrival: 30 },
    { key: 'louvor', ministry: 'Louvor', name: 'Louvor', kind: 'music', required: 2, music: true, arrival: 60 },
    { key: 'holyrics', ministry: 'Mídia', name: 'Holyrics', kind: 'general', arrival: 30 },
    { key: 'cafe', ministry: 'Café', name: 'Café da manhã', kind: 'general', arrival: 45 },
  ]
  for (const [i, def] of dutyDefs.entries()) {
    const [row] = await db.insert(duties).values({
      churchId: church!.id, ministryId: ms[def.ministry]!, name: def.name, kind: def.kind, position: i,
      defaultRequiredCount: def.required ?? 1, receivesMusicNotice: def.music ?? false, arrivalMinutesBefore: def.arrival ?? null,
      instructions: `Instruções de ${def.name}.`,
    }).returning()
    d[def.key] = row!.id
  }

  const passwordHash = await hashPassword('senha-de-teste-123')
  async function addPerson(name: string, roles: Role[], dutyKeys: string[], opts2: { consent?: boolean, phone?: string | null } = {}): Promise<PersonFixture> {
    const phone = opts2.phone === undefined ? nextPhone() : opts2.phone
    let accountId: string | null = null
    if (opts.withAccounts !== false) {
      const [acc] = await db.insert(accounts).values({ login: phone ?? `${slug}-${name}@teste`, passwordHash, displayName: name }).returning()
      accountId = acc!.id
    }
    const [p] = await db.insert(people).values({ churchId: church!.id, accountId, displayName: name, nameKey: nameKey(name), phoneE164: phone, roles }).returning()
    if (dutyKeys.length) await db.insert(qualifications).values(dutyKeys.map((k) => ({ churchId: church!.id, personId: p!.id, dutyId: d[k]! })))
    if (opts2.consent !== false && phone) {
      await db.insert(consents).values({ churchId: church!.id, personId: p!.id, status: 'granted', grantedAt: new Date(), source: 'presencial' })
    }
    return { id: p!.id, accountId, displayName: name, phone, ctx: { church: church!, accountId, personId: p!.id, roles } }
  }

  const coord = await addPerson('Coordenação Teste', ['coordinator', 'participant'], ['abertura'])
  const pastor = await addPerson('Pastor Paulo', ['pastor', 'participant'], ['sermao', 'abertura'])
  const ana = await addPerson('Ana Lima', ['participant'], ['leitura', 'abertura', 'cafe'])
  const bruno = await addPerson('Bruno Reis', ['participant'], ['leitura', 'holyrics', 'louvor'])
  const carla = await addPerson('Carla Dias', ['participant'], ['louvor', 'leitura', 'holyrics'])
  const davi = await addPerson('Davi Souza', ['participant'], ['cafe', 'holyrics'], { consent: false })
  return { church: church!, duties: d, ministries: ms, coord, pastor, ana, bruno, carla, davi, addPerson }
}

export type ChurchFixture = Awaited<ReturnType<typeof makeChurch>>

// Culto num domingo futuro às 9h30, com todos os postos padrão.
export async function makeService(db: Db, f: ChurchFixture, date: string, time = '09:30', title = 'Culto dominical') {
  return createService(db, f.coord.ctx, { date, time, title, durationMinutes: 120, kind: 'regular' })
}

export function slotOf(slots: { id: string, dutyId: string }[], dutyId: string) {
  const s = slots.find((x) => x.dutyId === dutyId)
  if (!s) throw new Error('posto não encontrado')
  return s.id
}
