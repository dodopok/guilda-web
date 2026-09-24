import { and, asc, desc, eq, gt, inArray, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getConfig } from '../config'
import type { Db, DbOrTx } from '../db/client'
import {
  assignments,
  duties,
  liturgicalSnapshots,
  liturgyTemplates,
  outboundMessages,
  people,
  scheduleMonths,
  scriptBlocks,
  scriptVersions,
  serviceScripts,
  services,
  slots,
  songs,
  templateBlocks,
} from '../db/schema'
import type { ScriptBlockData } from '../db/schema'
import { sha256 } from '../lib/crypto'
import { badRequest, forbidden, notFound } from '../lib/errors'
import { formatServiceDate, localParts } from '../lib/time'
import { firstName, nameKey } from '../lib/text'
import { EstevaoError, fetchLiturgicalDay, type LiturgicalSuggestion, sundayTitle } from '../integrations/estevao'
import { searchCifraClub, SongSearchError } from '../integrations/cifraclub'
import { audit } from './audit'
import { type ChurchContext, isCoordinator, isPastor, requireCoordinator } from './context'
import { enqueueMessage } from './messaging/outbox'

export const BLOCK_TYPES = ['heading', 'rite', 'reading', 'psalm', 'collect', 'sermon', 'music', 'announcements', 'text'] as const
export const TEXT_SOURCES = ['church', 'loc_manual', 'estevao', 'other'] as const

// ---------------------------------------------------------------------------
// Modelos
// ---------------------------------------------------------------------------

const templateBlockSchema = z.object({
  type: z.enum(BLOCK_TYPES),
  title: z.string().trim().min(1).max(200),
  body: z.string().max(20000).nullable().optional(),
  textSource: z.enum(TEXT_SOURCES).default('church'),
  dutyId: z.string().uuid().nullable().optional(),
})

export const templateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(['regular', 'special', 'short']).default('regular'),
  description: z.string().trim().max(1000).nullable().optional(),
  blocks: z.array(templateBlockSchema).max(200).optional(),
})

async function assertDuties(db: DbOrTx, churchId: string, ids: (string | null | undefined)[]) {
  const list = [...new Set(ids.filter((x): x is string => Boolean(x)))]
  if (!list.length) return
  const found = await db.select({ id: duties.id }).from(duties).where(and(eq(duties.churchId, churchId), inArray(duties.id, list)))
  if (found.length !== list.length) throw badRequest('invalid_duty', 'Função inexistente nesta igreja.')
}

export async function listTemplates(db: Db, ctx: ChurchContext) {
  const rows = await db.select().from(liturgyTemplates).where(eq(liturgyTemplates.churchId, ctx.church.id)).orderBy(asc(liturgyTemplates.archived), asc(liturgyTemplates.name))
  const counts = await db.select({ templateId: templateBlocks.templateId, n: sql<number>`count(*)::int` }).from(templateBlocks)
    .where(eq(templateBlocks.churchId, ctx.church.id)).groupBy(templateBlocks.templateId)
  const countOf = new Map(counts.map((c) => [c.templateId, c.n]))
  return rows.map((t) => ({ ...t, blockCount: countOf.get(t.id) ?? 0 }))
}

export async function getTemplate(db: Db, ctx: ChurchContext, id: string) {
  const t = await db.query.liturgyTemplates.findFirst({ where: and(eq(liturgyTemplates.churchId, ctx.church.id), eq(liturgyTemplates.id, id)) })
  if (!t) throw notFound('Modelo')
  const blocks = await db.select().from(templateBlocks).where(and(eq(templateBlocks.churchId, ctx.church.id), eq(templateBlocks.templateId, id))).orderBy(asc(templateBlocks.position))
  return { ...t, blocks }
}

export async function createTemplate(db: Db, ctx: ChurchContext, input: z.infer<typeof templateSchema>) {
  requireCoordinator(ctx)
  return db.transaction(async (tx) => {
    await assertDuties(tx, ctx.church.id, (input.blocks ?? []).map((b) => b.dutyId))
    const [t] = await tx.insert(liturgyTemplates).values({ churchId: ctx.church.id, name: input.name, kind: input.kind, description: input.description ?? null }).returning()
    if (input.blocks?.length) {
      await tx.insert(templateBlocks).values(input.blocks.map((b, i) => ({
        churchId: ctx.church.id, templateId: t!.id, position: i, type: b.type, title: b.title, body: b.body ?? null, textSource: b.textSource, dutyId: b.dutyId ?? null,
      })))
    }
    await audit(tx, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'template.created', entityType: 'template', entityId: t!.id })
    return t!
  })
}

export async function updateTemplate(db: Db, ctx: ChurchContext, id: string, input: Partial<z.infer<typeof templateSchema>> & { archived?: boolean }) {
  requireCoordinator(ctx)
  return db.transaction(async (tx) => {
    const t = await tx.query.liturgyTemplates.findFirst({ where: and(eq(liturgyTemplates.churchId, ctx.church.id), eq(liturgyTemplates.id, id)) })
    if (!t) throw notFound('Modelo')
    await tx.update(liturgyTemplates).set({
      ...(input.name ? { name: input.name } : {}),
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.archived !== undefined ? { archived: input.archived } : {}),
      updatedAt: new Date(),
    }).where(eq(liturgyTemplates.id, id))
    if (input.blocks) {
      await assertDuties(tx, ctx.church.id, input.blocks.map((b) => b.dutyId))
      await tx.delete(templateBlocks).where(and(eq(templateBlocks.churchId, ctx.church.id), eq(templateBlocks.templateId, id)))
      if (input.blocks.length) {
        await tx.insert(templateBlocks).values(input.blocks.map((b, i) => ({
          churchId: ctx.church.id, templateId: id, position: i, type: b.type, title: b.title, body: b.body ?? null, textSource: b.textSource, dutyId: b.dutyId ?? null,
        })))
      }
    }
    await audit(tx, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'template.updated', entityType: 'template', entityId: id })
    return { id }
  })
}

// Cópia para adaptar a festas, liturgias longas ou cultos intencionalmente curtos.
export async function duplicateTemplate(db: Db, ctx: ChurchContext, id: string, input: { name: string, kind?: 'regular' | 'special' | 'short' }) {
  requireCoordinator(ctx)
  const t = await getTemplate(db, ctx, id)
  return createTemplate(db, ctx, {
    name: input.name,
    kind: input.kind ?? t.kind as 'regular',
    description: t.description,
    blocks: t.blocks.map((b) => ({ type: b.type as typeof BLOCK_TYPES[number], title: b.title, body: b.body, textSource: b.textSource as typeof TEXT_SOURCES[number], dutyId: b.dutyId })),
  })
}

// ---------------------------------------------------------------------------
// Roteiro do culto
// ---------------------------------------------------------------------------

async function loadService(db: DbOrTx, ctx: ChurchContext, serviceId: string) {
  const s = await db.query.services.findFirst({ where: and(eq(services.churchId, ctx.church.id), eq(services.id, serviceId)) })
  if (!s) throw notFound('Culto')
  return s
}

async function loadScript(db: DbOrTx, ctx: ChurchContext, serviceId: string) {
  return db.query.serviceScripts.findFirst({ where: and(eq(serviceScripts.churchId, ctx.church.id), eq(serviceScripts.serviceId, serviceId)) })
}

// Quem pode ver rascunho: coordenação, pastores e quem prega neste culto.
async function isPreacherOf(db: DbOrTx, ctx: ChurchContext, serviceId: string) {
  if (!ctx.personId) return false
  const rows = await db.select({ id: assignments.id }).from(assignments)
    .innerJoin(slots, and(eq(slots.churchId, assignments.churchId), eq(slots.id, assignments.slotId)))
    .innerJoin(duties, and(eq(duties.churchId, slots.churchId), eq(duties.id, slots.dutyId)))
    .where(and(eq(assignments.churchId, ctx.church.id), eq(assignments.personId, ctx.personId), eq(slots.serviceId, serviceId), eq(duties.kind, 'sermon'), ne(assignments.status, 'declined')))
    .limit(1)
  return rows.length > 0
}

async function canSeeDraft(db: DbOrTx, ctx: ChurchContext, serviceId: string) {
  return isCoordinator(ctx) || isPastor(ctx) || isPreacherOf(db, ctx, serviceId)
}

async function canChooseMusic(db: DbOrTx, ctx: ChurchContext, serviceId: string, chooser: string) {
  if (isCoordinator(ctx) || isPastor(ctx)) return true
  return chooser === 'preacher' && isPreacherOf(db, ctx, serviceId)
}

// Leituras do lecionário. O modelo guarda uma leitura por posição, com estes títulos; o
// roteiro sabe assim quais o Estêvão deve preencher e mantém quem lê cada posição.
export const READING_SLOTS = [
  { slot: 'first_reading', title: 'Primeira leitura', type: 'reading' },
  { slot: 'psalm', title: 'Salmo', type: 'psalm' },
  { slot: 'second_reading', title: 'Segunda leitura', type: 'reading' },
  { slot: 'gospel', title: 'Evangelho', type: 'reading' },
] as const
// Outros nomes de posição usados por alguns livros de oração.
const SLOT_ALIASES: Record<string, string> = { old_testament: 'first_reading', epistle: 'second_reading', psalm_alternative: 'psalm' }
export function canonicalSlot(key: string) {
  return SLOT_ALIASES[key] ?? key
}
function slotFromTitle(title: string) {
  const k = nameKey(title)
  return READING_SLOTS.find((x) => nameKey(x.title) === k)?.slot
}

export async function createScript(db: Db, ctx: ChurchContext, serviceId: string, templateId?: string | null) {
  requireCoordinator(ctx)
  return db.transaction(async (tx) => {
    const service = await loadService(tx, ctx, serviceId)
    const existing = await loadScript(tx, ctx, serviceId)
    if (existing) throw badRequest('script_exists', 'Este culto já tem roteiro.')
    let blocks: (typeof templateBlocks.$inferSelect)[] = []
    if (templateId) {
      const t = await tx.query.liturgyTemplates.findFirst({ where: and(eq(liturgyTemplates.churchId, ctx.church.id), eq(liturgyTemplates.id, templateId)) })
      if (!t) throw badRequest('invalid_template', 'Modelo inexistente nesta igreja.')
      blocks = await tx.select().from(templateBlocks).where(and(eq(templateBlocks.churchId, ctx.church.id), eq(templateBlocks.templateId, templateId))).orderBy(asc(templateBlocks.position))
    }
    const [script] = await tx.insert(serviceScripts).values({
      churchId: ctx.church.id,
      serviceId,
      templateId: templateId ?? null,
      title: service.title,
    }).returning()
    // Avisos marcados como "todo domingo" no roteiro mais recente voltam automaticamente.
    const fixedItems = blocks.some((b) => b.type === 'announcements') ? await latestFixedAnnouncements(tx, ctx.church.id, serviceId) : []
    if (blocks.length) {
      await tx.insert(scriptBlocks).values(blocks.map((b, i) => ({
        churchId: ctx.church.id, scriptId: script!.id, position: i, type: b.type, title: b.title, body: b.body, textSource: b.textSource, dutyId: b.dutyId,
        data: b.type === 'announcements' && fixedItems.length
          ? { items: fixedItems }
          : b.type === 'rite' || b.type === 'text'
            ? { templateBody: b.body }
            : (b.type === 'reading' || b.type === 'psalm') && slotFromTitle(b.title) ? { slot: slotFromTitle(b.title) } : {},
      })))
    }
    await audit(tx, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'script.created', entityType: 'script', entityId: script!.id, data: { templateId } })
    return script!
  })
}

async function latestFixedAnnouncements(db: DbOrTx, churchId: string, exceptServiceId: string) {
  const rows = await db.select({ data: scriptBlocks.data }).from(scriptBlocks)
    .innerJoin(serviceScripts, and(eq(serviceScripts.churchId, scriptBlocks.churchId), eq(serviceScripts.id, scriptBlocks.scriptId)))
    .where(and(eq(scriptBlocks.churchId, churchId), eq(scriptBlocks.type, 'announcements'), ne(serviceScripts.serviceId, exceptServiceId)))
    .orderBy(desc(serviceScripts.updatedAt)).limit(1)
  return (rows[0]?.data.items ?? []).filter((i) => i.fixed).map((i) => ({ text: i.text, fixed: true, status: 'ready' as const }))
}

interface Responsible { personId: string, name: string, status: string, scheduled: boolean }

// Responsáveis atuais de cada bloco, lidos da escala do culto (sem copiar nomes à mão).
async function resolveResponsibles(db: DbOrTx, ctx: ChurchContext, serviceId: string, blocks: (typeof scriptBlocks.$inferSelect)[]) {
  const rows = await db.select({ dutyId: slots.dutyId, personId: people.id, name: people.displayName, status: assignments.status }).from(assignments)
    .innerJoin(slots, and(eq(slots.churchId, assignments.churchId), eq(slots.id, assignments.slotId)))
    .innerJoin(people, and(eq(people.churchId, assignments.churchId), eq(people.id, assignments.personId)))
    .where(and(eq(assignments.churchId, ctx.church.id), eq(slots.serviceId, serviceId)))
    .orderBy(asc(slots.position), asc(people.nameKey))
  const explicitIds = blocks.map((b) => b.personId).filter((x): x is string => Boolean(x))
  const explicit = explicitIds.length ? await db.select().from(people).where(and(eq(people.churchId, ctx.church.id), inArray(people.id, explicitIds))) : []
  const result = new Map<string, Responsible[]>()
  for (const b of blocks) {
    if (b.personId) {
      const p = explicit.find((x) => x.id === b.personId)
      const inSchedule = rows.find((r) => r.personId === b.personId && (!b.dutyId || r.dutyId === b.dutyId))
      result.set(b.id, p ? [{ personId: p.id, name: p.displayName, status: inSchedule?.status ?? 'not_scheduled', scheduled: Boolean(inSchedule) }] : [])
    } else if (b.dutyId) {
      result.set(b.id, rows.filter((r) => r.dutyId === b.dutyId && r.status !== 'declined').map((r) => ({ personId: r.personId, name: r.name, status: r.status, scheduled: true })))
    } else {
      result.set(b.id, [])
    }
  }
  return result
}

function responsiblesKey(list: { name: string }[]) {
  return list.map((r) => r.name).sort().join('|')
}

export async function getScript(db: Db, ctx: ChurchContext, serviceId: string) {
  const service = await loadService(db, ctx, serviceId)
  const script = await loadScript(db, ctx, serviceId)
  const draftAllowed = await canSeeDraft(db, ctx, serviceId)
  const latest = script
    ? await db.query.scriptVersions.findFirst({ where: and(eq(scriptVersions.churchId, ctx.church.id), eq(scriptVersions.scriptId, script.id)), orderBy: desc(scriptVersions.version) })
    : null
  const base = {
    service: {
      id: service.id,
      title: service.title,
      startsAt: service.startsAt,
      localDate: service.localDate,
      time: localParts(service.startsAt, ctx.church.timezone).time,
      location: service.location,
      kind: service.kind,
      status: service.status,
    },
    // Pastores editam o rascunho (revisão informal); publicar é da coordenação.
    canEdit: isCoordinator(ctx) || isPastor(ctx),
    canPublish: isCoordinator(ctx),
    canChooseMusic: script ? await canChooseMusic(db, ctx, serviceId, script.musicChooser) : false,
    published: latest ? { version: latest.version, publishedAt: latest.createdAt, content: latest.content } : null,
  }
  if (!script || !draftAllowed) {
    // Participantes veem só a versão publicada.
    const review = latest && script ? await reviewStatus(db, ctx, serviceId, latest.content) : null
    return { ...base, draft: null, needsReview: review }
  }
  const blocks = await db.select().from(scriptBlocks).where(and(eq(scriptBlocks.churchId, ctx.church.id), eq(scriptBlocks.scriptId, script.id))).orderBy(asc(scriptBlocks.position))
  const responsibles = await resolveResponsibles(db, ctx, serviceId, blocks)
  const songIds = blocks.flatMap((b) => b.data.songIds ?? [])
  const songRows = songIds.length ? await db.select().from(songs).where(and(eq(songs.churchId, ctx.church.id), inArray(songs.id, songIds))) : []
  const noticeRows = await db.select({ key: outboundMessages.idempotencyKey }).from(outboundMessages)
    .where(and(eq(outboundMessages.churchId, ctx.church.id), sql`${outboundMessages.idempotencyKey} like ${`reading:${script.id}:%`}`, ne(outboundMessages.status, 'cancelled')))
  const noticeKeys = new Set(noticeRows.map((r) => r.key))
  const snapshot = script.liturgicalSnapshotId
    ? await db.query.liturgicalSnapshots.findFirst({ where: and(eq(liturgicalSnapshots.churchId, ctx.church.id), eq(liturgicalSnapshots.id, script.liturgicalSnapshotId)) })
    : null
  return {
    ...base,
    draft: {
      id: script.id,
      title: script.title,
      status: script.status,
      version: script.version,
      templateId: script.templateId,
      liturgy: script.liturgy,
      pastoralNote: script.pastoralNote,
      musicChooser: script.musicChooser,
      updatedAt: script.updatedAt,
      snapshot: snapshot ? { id: snapshot.id, source: snapshot.source, fetchedAt: snapshot.fetchedAt, requestPath: snapshot.requestPath, prayerBook: snapshot.prayerBook } : null,
      blocks: blocks.map((b) => ({
        id: b.id,
        position: b.position,
        type: b.type,
        title: b.title,
        body: b.body,
        textSource: b.textSource,
        dutyId: b.dutyId,
        personId: b.personId,
        data: b.data,
        responsibles: responsibles.get(b.id) ?? [],
        songs: (b.data.songIds ?? []).map((id) => songRows.find((s) => s.id === id)).filter(Boolean),
        readerNotified: b.personId && b.data.reference ? noticeKeys.has(readingNoticeKey(script.id, b.personId, b.title, b.data.reference.trim())) : false,
      })),
      hasUnpublishedChanges: !latest || script.updatedAt > latest.createdAt,
    },
    needsReview: latest ? await reviewStatus(db, ctx, serviceId, latest.content) : null,
  }
}

interface PublishedBlock { id: string, title: string, dutyId: string | null, personId: string | null, responsibles: { name: string }[] }

// Mudança na escala depois da publicação do roteiro: sinaliza, sem alterar o publicado.
async function reviewStatus(db: DbOrTx, ctx: ChurchContext, serviceId: string, content: Record<string, unknown>) {
  const blocks = (content.blocks ?? []) as PublishedBlock[]
  const fake = blocks.map((b) => ({ id: b.id, dutyId: b.dutyId, personId: b.personId })) as (typeof scriptBlocks.$inferSelect)[]
  const current = await resolveResponsibles(db, ctx, serviceId, fake)
  const changes = []
  for (const b of blocks) {
    const now = current.get(b.id) ?? []
    if (responsiblesKey(now) !== responsiblesKey(b.responsibles ?? [])) {
      changes.push({ blockTitle: b.title, published: (b.responsibles ?? []).map((r) => r.name), current: now.map((r) => r.name) })
    }
  }
  return { required: changes.length > 0, changes }
}

export const scriptUpdateSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  pastoralNote: z.string().trim().max(4000).nullable().optional(),
  musicChooser: z.enum(['preacher', 'pastors']).optional(),
  liturgy: z.object({
    color: z.string().trim().max(60).nullable().optional(),
    celebration: z.string().trim().max(200).nullable().optional(),
    sundayName: z.string().trim().max(200).nullable().optional(),
    season: z.string().trim().max(120).nullable().optional(),
    source: z.enum(['estevao', 'manual']).optional(),
  }).optional(),
})

export async function updateScript(db: Db, ctx: ChurchContext, serviceId: string, input: z.infer<typeof scriptUpdateSchema>) {
  const script = await loadScript(db, ctx, serviceId)
  if (!script) throw notFound('Roteiro')
  // Pastores podem registrar a revisão informal; o restante é da coordenação.
  const onlyPastoral = Object.keys(input).every((k) => k === 'pastoralNote')
  if (!isCoordinator(ctx) && !(onlyPastoral && isPastor(ctx))) throw forbidden()
  await db.update(serviceScripts).set({
    ...(input.title ? { title: input.title } : {}),
    ...(input.pastoralNote !== undefined ? { pastoralNote: input.pastoralNote } : {}),
    ...(input.musicChooser ? { musicChooser: input.musicChooser } : {}),
    ...(input.liturgy ? { liturgy: { ...script.liturgy, ...input.liturgy, source: input.liturgy.source ?? 'manual' } } : {}),
    updatedAt: new Date(),
  }).where(eq(serviceScripts.id, script.id))
  await audit(db, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'script.updated', entityType: 'script', entityId: script.id, data: { fields: Object.keys(input) } })
  return getScript(db, ctx, serviceId)
}

const musicalKey = z.string().trim().max(20)
const songKeysSchema = z.record(z.string().uuid(), musicalKey).refine((r) => Object.keys(r).length <= 30)
// Tom da música neste culto: o escolhido na hora ou, sem escolha, o original do repertório.
export function keyFor(data: ScriptBlockData, song: { id: string, musicalKey: string | null }) {
  return data.songKeys?.[song.id]?.trim() || song.musicalKey || null
}

const scriptBlockSchema = z.object({
  type: z.enum(BLOCK_TYPES),
  title: z.string().trim().min(1).max(200),
  body: z.string().max(20000).nullable().optional(),
  textSource: z.enum(TEXT_SOURCES).default('church'),
  dutyId: z.string().uuid().nullable().optional(),
  personId: z.string().uuid().nullable().optional(),
  data: z.object({
    reference: z.string().trim().max(200).optional(),
    alternatives: z.array(z.string().trim().min(1).max(200)).max(6).optional(),
    source: z.enum(['estevao', 'manual']).optional(),
    slot: z.string().trim().max(40).optional(),
    songIds: z.array(z.string().uuid()).max(30).optional(),
    songKeys: songKeysSchema.optional(),
    items: z.array(z.object({
      text: z.string().trim().min(1).max(1000),
      ownerPersonId: z.string().uuid().nullable().optional(),
      status: z.enum(['draft', 'ready']).default('draft'),
      fixed: z.boolean().optional(),
    })).max(50).optional(),
    templateBody: z.string().max(20000).nullable().optional(),
  }).default({}),
})

export const blocksSchema = z.object({ blocks: z.array(scriptBlockSchema).max(200) })

// Substitui a lista de blocos (ordem, textos, leituras, avisos). Coordenação e pastores
// editam o rascunho; só a coordenação publica.
export async function replaceBlocks(db: Db, ctx: ChurchContext, serviceId: string, raw: z.input<typeof blocksSchema>) {
  if (!isCoordinator(ctx) && !isPastor(ctx)) throw forbidden()
  const input = blocksSchema.parse(raw)
  await db.transaction(async (tx) => {
    const script = await loadScript(tx, ctx, serviceId)
    if (!script) throw notFound('Roteiro')
    await assertDuties(tx, ctx.church.id, input.blocks.map((b) => b.dutyId))
    const personIds = [...new Set(input.blocks.flatMap((b) => [b.personId, ...(b.data.items ?? []).map((i) => i.ownerPersonId)]).filter((x): x is string => Boolean(x)))]
    if (personIds.length) {
      const found = await tx.select({ id: people.id }).from(people).where(and(eq(people.churchId, ctx.church.id), inArray(people.id, personIds)))
      if (found.length !== personIds.length) throw badRequest('invalid_person', 'Pessoa inexistente nesta igreja.')
    }
    const songIds = [...new Set(input.blocks.flatMap((b) => b.data.songIds ?? []))]
    if (songIds.length) {
      const found = await tx.select({ id: songs.id }).from(songs).where(and(eq(songs.churchId, ctx.church.id), inArray(songs.id, songIds)))
      if (found.length !== songIds.length) throw badRequest('invalid_song', 'Música inexistente no repertório desta igreja.')
    }
    await tx.delete(scriptBlocks).where(and(eq(scriptBlocks.churchId, ctx.church.id), eq(scriptBlocks.scriptId, script.id)))
    if (input.blocks.length) {
      await tx.insert(scriptBlocks).values(input.blocks.map((b, i) => ({
        churchId: ctx.church.id, scriptId: script.id, position: i, type: b.type, title: b.title, body: b.body ?? null,
        textSource: b.textSource, dutyId: b.dutyId ?? null, personId: b.personId ?? null, data: b.data as ScriptBlockData,
      })))
    }
    await tx.update(serviceScripts).set({ updatedAt: new Date() }).where(eq(serviceScripts.id, script.id))
    await audit(tx, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'script.blocks_updated', entityType: 'script', entityId: script.id, data: { blocks: input.blocks.length } })
  })
  return getScript(db, ctx, serviceId)
}

// ---------------------------------------------------------------------------
// Estêvão
// ---------------------------------------------------------------------------

// Busca sugestões do Estêvão e guarda uma foto com origem e horário. Falha externa não
// impede nada: a coordenação continua podendo preencher manualmente.
export async function fetchSuggestions(db: Db, ctx: ChurchContext, serviceId: string, fetchImpl?: typeof fetch) {
  requireCoordinator(ctx)
  const service = await loadService(db, ctx, serviceId)
  const cfg = getConfig().estevao
  try {
    const result = await fetchLiturgicalDay({ url: cfg.url, apiKey: cfg.apiKey, timeoutMs: cfg.timeoutMs, fetchImpl }, service.localDate, {
      prayerBook: ctx.church.liturgicalPrayerBook, readingType: ctx.church.liturgicalReadingType,
    })
    const [snap] = await db.insert(liturgicalSnapshots).values({
      churchId: ctx.church.id,
      date: service.localDate,
      prayerBook: ctx.church.liturgicalPrayerBook,
      source: 'estevao',
      requestPath: result.path,
      payload: result.suggestion as unknown as Record<string, unknown>,
    }).returning()
    return { ok: true as const, snapshotId: snap!.id, fetchedAt: snap!.fetchedAt, suggestion: result.suggestion }
  } catch (err) {
    if (err instanceof EstevaoError) {
      // Última foto guardada para a data, se houver.
      const last = await db.query.liturgicalSnapshots.findFirst({
        where: and(eq(liturgicalSnapshots.churchId, ctx.church.id), eq(liturgicalSnapshots.date, service.localDate), eq(liturgicalSnapshots.source, 'estevao')),
        orderBy: desc(liturgicalSnapshots.fetchedAt),
      })
      return {
        ok: false as const,
        error: { kind: err.kind, message: err.message },
        cached: last ? { snapshotId: last.id, fetchedAt: last.fetchedAt, suggestion: last.payload as unknown as LiturgicalSuggestion } : null,
      }
    }
    throw err
  }
}

export const applySchema = z.object({
  snapshotId: z.string().uuid(),
  collectIndex: z.number().int().min(0).nullable().optional(),
  readings: z.array(z.object({
    key: z.string(),
    reference: z.string().trim().min(1).max(200),
    label: z.string().trim().min(1).max(120),
    // Alternativas do lecionário, guardadas para trocar com um toque no roteiro.
    alternatives: z.array(z.string().trim().min(1).max(200)).max(6).default([]),
  })).max(12).default([]),
  replaceReadings: z.boolean().default(true),
  applyCalendar: z.boolean().default(true),
})

// Aplica ao roteiro as escolhas da coordenação a partir de uma foto do Estêvão.
export async function applySuggestions(db: Db, ctx: ChurchContext, serviceId: string, raw: z.input<typeof applySchema>) {
  requireCoordinator(ctx)
  const input = applySchema.parse(raw)
  await db.transaction(async (tx) => {
    const script = await loadScript(tx, ctx, serviceId)
    if (!script) throw notFound('Roteiro')
    const snap = await tx.query.liturgicalSnapshots.findFirst({ where: and(eq(liturgicalSnapshots.churchId, ctx.church.id), eq(liturgicalSnapshots.id, input.snapshotId)) })
    if (!snap) throw notFound('Dados litúrgicos')
    const suggestion = snap.payload as unknown as LiturgicalSuggestion
    let blocks = await tx.select().from(scriptBlocks).where(and(eq(scriptBlocks.churchId, ctx.church.id), eq(scriptBlocks.scriptId, script.id))).orderBy(asc(scriptBlocks.position))
    const next = blocks.map((b) => ({ ...b }))
    if (input.collectIndex !== undefined && input.collectIndex !== null) {
      const collect = suggestion.collects[input.collectIndex]
      if (!collect) throw badRequest('invalid_collect', 'Coleta não encontrada na resposta do Estêvão.')
      const target = next.find((b) => b.type === 'collect')
      if (target) {
        Object.assign(target, { title: 'Coleta do dia', body: collect.text, textSource: 'estevao', data: { ...target.data, source: 'estevao' } })
      } else {
        // Sem bloco de coleta no modelo: entra logo depois dos títulos do topo.
        const at = next.findIndex((b) => b.type !== 'heading')
        next.splice(at < 0 ? next.length : at, 0, { ...blankBlock(ctx, script.id), type: 'collect', title: 'Coleta do dia', body: collect.text, textSource: 'estevao', data: { source: 'estevao' } })
      }
    }
    if (input.readings.length || input.replaceReadings) {
      const readingDuty = await tx.query.duties.findFirst({ where: and(eq(duties.churchId, ctx.church.id), eq(duties.kind, 'reading')) })
      const firstReadingIdx = next.findIndex((b) => b.type === 'reading' || b.type === 'psalm')
      const oldReadings = next.filter((b) => b.type === 'reading' || b.type === 'psalm')
      const newReadings = input.readings.map((r, i) => {
        // Mesma posição do lecionário (ou, sem posição marcada, a mesma ordem).
        const slot = canonicalSlot(r.key)
        const previous = oldReadings.find((o) => o.data.slot === slot) ?? (oldReadings.some((o) => o.data.slot) ? undefined : oldReadings[i])
        return {
          ...blankBlock(ctx, script.id),
          type: r.key.startsWith('psalm') ? 'psalm' : 'reading',
          title: r.label,
          body: null,
          textSource: 'estevao',
          // Mantém a pessoa já atribuída à leitura na mesma posição, se houver.
          dutyId: previous?.dutyId ?? readingDuty?.id ?? null,
          personId: previous?.personId ?? null,
          data: { reference: r.reference, source: 'estevao' as const, slot, ...(r.alternatives.length ? { alternatives: r.alternatives } : {}) },
        }
      })
      if (input.replaceReadings) {
        const rest = next.filter((b) => b.type !== 'reading' && b.type !== 'psalm')
        const insertAt = firstReadingIdx >= 0 ? next.slice(0, firstReadingIdx).filter((b) => b.type !== 'reading' && b.type !== 'psalm').length : sermonIndex(rest)
        rest.splice(insertAt, 0, ...newReadings)
        blocks = rest as typeof blocks
      } else {
        const at = sermonIndex(next)
        next.splice(at, 0, ...newReadings)
        blocks = next as typeof blocks
      }
    } else {
      blocks = next as typeof blocks
    }
    // Bloco "Nome do domingo": recebe o nome da semana, com o Próprio no Tempo Comum.
    const sundayName = sundayTitle(suggestion)
    if (input.applyCalendar && sundayName) {
      for (const b of blocks) if (b.type === 'heading' && b.textSource === 'estevao') b.title = sundayName
    }
    await tx.delete(scriptBlocks).where(and(eq(scriptBlocks.churchId, ctx.church.id), eq(scriptBlocks.scriptId, script.id)))
    if (blocks.length) {
      await tx.insert(scriptBlocks).values(blocks.map((b, i) => ({
        churchId: ctx.church.id, scriptId: script.id, position: i, type: b.type, title: b.title, body: b.body, textSource: b.textSource, dutyId: b.dutyId, personId: b.personId, data: b.data,
      })))
    }
    await tx.update(serviceScripts).set({
      liturgicalSnapshotId: snap.id,
      ...(input.applyCalendar
        ? {
            liturgy: {
              ...script.liturgy,
              color: suggestion.color,
              celebration: suggestion.celebration,
              sundayName: suggestion.sundayName,
              season: suggestion.season,
              source: 'estevao',
            },
          }
        : {}),
      updatedAt: new Date(),
    }).where(eq(serviceScripts.id, script.id))
    await audit(tx, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'script.estevao_applied', entityType: 'script', entityId: script.id, data: { snapshotId: snap.id, readings: input.readings.length } })
  })
  return getScript(db, ctx, serviceId)
}

function blankBlock(ctx: ChurchContext, scriptId: string) {
  return {
    id: '', churchId: ctx.church.id, scriptId, position: 0, type: 'text', title: '', body: null as string | null,
    textSource: 'church', dutyId: null as string | null, personId: null as string | null, data: {} as ScriptBlockData, createdAt: new Date(),
  }
}

function sermonIndex(list: { type: string }[]) {
  const i = list.findIndex((b) => b.type === 'sermon')
  return i >= 0 ? i : list.length
}

// ---------------------------------------------------------------------------
// Músicas
// ---------------------------------------------------------------------------

export const songSchema = z.object({
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().max(200).nullable().optional(),
  musicalKey: musicalKey.nullable().optional(),
  link: z.string().trim().url().max(500).nullable().optional().or(z.literal('').transform(() => null)),
  notes: z.string().trim().max(1000).nullable().optional(),
})

async function canManageSongs(db: DbOrTx, ctx: ChurchContext) {
  if (isCoordinator(ctx) || isPastor(ctx)) return true
  if (!ctx.personId) return false
  const rows = await db.select({ id: assignments.id }).from(assignments)
    .innerJoin(slots, and(eq(slots.churchId, assignments.churchId), eq(slots.id, assignments.slotId)))
    .innerJoin(duties, and(eq(duties.churchId, slots.churchId), eq(duties.id, slots.dutyId)))
    .innerJoin(services, and(eq(services.churchId, slots.churchId), eq(services.id, slots.serviceId)))
    .where(and(eq(assignments.churchId, ctx.church.id), eq(assignments.personId, ctx.personId), eq(duties.kind, 'sermon'), gt(services.startsAt, new Date())))
    .limit(1)
  return rows.length > 0
}

export async function listSongs(db: Db, ctx: ChurchContext) {
  return db.select().from(songs).where(eq(songs.churchId, ctx.church.id)).orderBy(asc(songs.title))
}

export async function createSong(db: Db, ctx: ChurchContext, input: z.infer<typeof songSchema>) {
  if (!(await canManageSongs(db, ctx))) throw forbidden()
  // Mesma cifra escolhida de novo pela busca: reaproveita a música do repertório.
  if (input.link) {
    const existing = await db.query.songs.findFirst({ where: and(eq(songs.churchId, ctx.church.id), eq(songs.link, input.link)) })
    if (existing) return existing
  }
  const [row] = await db.insert(songs).values({ churchId: ctx.church.id, title: input.title, author: input.author ?? null, musicalKey: input.musicalKey ?? null, link: input.link ?? null, notes: input.notes ?? null }).returning()
  return row!
}

export async function updateSong(db: Db, ctx: ChurchContext, id: string, input: Partial<z.infer<typeof songSchema>>) {
  if (!(await canManageSongs(db, ctx))) throw forbidden()
  const [row] = await db.update(songs).set(input).where(and(eq(songs.churchId, ctx.church.id), eq(songs.id, id))).returning()
  if (!row) throw notFound('Música')
  return row
}

// Busca no Cifra Club para quem escolhe músicas. Falha na busca não impede usar o repertório.
export async function searchSongs(db: Db, ctx: ChurchContext, query: string, fetchImpl?: typeof fetch) {
  if (!(await canManageSongs(db, ctx))) throw forbidden()
  const cfg = getConfig().songSearch
  try {
    return { available: true, hits: await searchCifraClub({ url: cfg.url, timeoutMs: cfg.timeoutMs, fetchImpl }, query) }
  } catch (err) {
    if (!(err instanceof SongSearchError)) throw err
    return { available: false, reason: err.message, hits: [] }
  }
}

export const musicSchema = z.object({ blockId: z.string().uuid().optional(), songIds: z.array(z.string().uuid()).max(30), songKeys: songKeysSchema.optional() })

// Quem prega (ou os pastores, quando pedem) escolhe as músicas, sem editar o resto.
export async function setMusic(db: Db, ctx: ChurchContext, serviceId: string, input: z.infer<typeof musicSchema>) {
  await db.transaction(async (tx) => {
    const script = await loadScript(tx, ctx, serviceId)
    if (!script) throw notFound('Roteiro')
    if (!(await canChooseMusic(tx, ctx, serviceId, script.musicChooser))) throw forbidden('Somente quem prega neste culto, os pastores ou a coordenação escolhem as músicas.')
    if (input.songIds.length) {
      const found = await tx.select({ id: songs.id }).from(songs).where(and(eq(songs.churchId, ctx.church.id), inArray(songs.id, input.songIds)))
      if (found.length !== new Set(input.songIds).size) throw badRequest('invalid_song', 'Música inexistente no repertório desta igreja.')
    }
    const blocks = await tx.select().from(scriptBlocks).where(and(eq(scriptBlocks.churchId, ctx.church.id), eq(scriptBlocks.scriptId, script.id), eq(scriptBlocks.type, 'music'))).orderBy(asc(scriptBlocks.position))
    let target = input.blockId ? blocks.find((b) => b.id === input.blockId) : blocks[0]
    if (!target) {
      const [pos] = await tx.select({ n: sql<number>`coalesce(max(position), -1)::int` }).from(scriptBlocks).where(eq(scriptBlocks.scriptId, script.id))
      const [created] = await tx.insert(scriptBlocks).values({ churchId: ctx.church.id, scriptId: script.id, position: (pos?.n ?? -1) + 1, type: 'music', title: 'Músicas', data: {} }).returning()
      target = created!
    }
    const songKeys = Object.fromEntries(Object.entries(input.songKeys ?? {}).filter(([id, k]) => input.songIds.includes(id) && k))
    await tx.update(scriptBlocks).set({ data: { ...target.data, songIds: input.songIds, songKeys } }).where(eq(scriptBlocks.id, target.id))
    await tx.update(serviceScripts).set({ updatedAt: new Date() }).where(eq(serviceScripts.id, script.id))
    await audit(tx, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'script.music_set', entityType: 'script', entityId: script.id, data: { songIds: input.songIds, songKeys: input.songKeys ?? {} } })
  })
  return getScript(db, ctx, serviceId)
}

// Aviso individual às pessoas do louvor escaladas neste culto. Repetir com a mesma
// seleção não reenvia; mudar as músicas gera novo aviso.
export async function notifyMusic(db: Db, ctx: ChurchContext, serviceId: string) {
  const script = await loadScript(db, ctx, serviceId)
  if (!script) throw notFound('Roteiro')
  if (!(await canChooseMusic(db, ctx, serviceId, script.musicChooser))) throw forbidden()
  const service = await loadService(db, ctx, serviceId)
  const blocks = await db.select().from(scriptBlocks).where(and(eq(scriptBlocks.churchId, ctx.church.id), eq(scriptBlocks.scriptId, script.id), eq(scriptBlocks.type, 'music'))).orderBy(asc(scriptBlocks.position))
  const picks = blocks.flatMap((b) => (b.data.songIds ?? []).map((id) => ({ id, data: b.data })))
  const songIds = picks.map((p) => p.id)
  if (!songIds.length) throw badRequest('no_songs', 'Escolha as músicas antes de avisar o louvor.')
  const songRows = await db.select().from(songs).where(and(eq(songs.churchId, ctx.church.id), inArray(songs.id, songIds)))
  const ordered = picks.flatMap((p) => {
    const song = songRows.find((s) => s.id === p.id)
    return song ? [{ title: song.title, key: keyFor(p.data, song) }] : []
  })
  const list = ordered.map((s) => (s.key ? `${s.title} (tom ${s.key})` : s.title)).join(', ')
  const month = await db.query.scheduleMonths.findFirst({ where: and(eq(scheduleMonths.churchId, ctx.church.id), eq(scheduleMonths.month, service.month)) })
  if (month?.status !== 'published') throw badRequest('schedule_not_published', 'Publique a escala do mês antes de avisar o louvor.')
  const team = await db.selectDistinct({ personId: people.id, name: people.displayName }).from(assignments)
    .innerJoin(slots, and(eq(slots.churchId, assignments.churchId), eq(slots.id, assignments.slotId)))
    .innerJoin(duties, and(eq(duties.churchId, slots.churchId), eq(duties.id, slots.dutyId)))
    .innerJoin(people, and(eq(people.churchId, assignments.churchId), eq(people.id, assignments.personId)))
    .where(and(eq(assignments.churchId, ctx.church.id), eq(slots.serviceId, serviceId), eq(duties.receivesMusicNotice, true), ne(assignments.status, 'declined')))
  // Trocar música ou tom gera novo aviso; repetir a mesma lista não reenvia.
  const hash = sha256(ordered.map((s) => `${s.title}|${s.key ?? ''}`).join(',')).slice(0, 16)
  let queued = 0
  let blocked = 0
  for (const member of team) {
    const msg = await enqueueMessage(db, {
      churchId: ctx.church.id,
      personId: member.personId,
      kind: 'music_notice',
      idempotencyKey: `music:${script.id}:${hash}:${member.personId}`,
      params: [firstName(member.name), formatServiceDate(service.startsAt, ctx.church.timezone), ctx.church.name, list, `${getConfig().appBaseUrl}/i/${ctx.church.slug}/roteiros/${serviceId}`],
    })
    if (msg.status === 'blocked') blocked++
    else queued++
  }
  await audit(db, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'script.music_notified', entityType: 'script', entityId: script.id, data: { recipients: team.length } })
  return { recipients: team.length, queued, blocked }
}

// Chave do aviso de leitura: muda se a pessoa, a leitura ou a referência mudarem, e só
// então um novo aviso pode sair. Os blocos são recriados ao salvar, por isso não usa o id.
export function readingNoticeKey(scriptId: string, personId: string, title: string, reference: string) {
  return `reading:${scriptId}:${personId}:${sha256(`${title}|${reference}`).slice(0, 16)}`
}

// Avisa pelo WhatsApp a pessoa escolhida para uma leitura, com a referência.
export async function notifyReader(db: Db, ctx: ChurchContext, serviceId: string, blockId: string) {
  if (!isCoordinator(ctx) && !isPastor(ctx)) throw forbidden()
  const script = await loadScript(db, ctx, serviceId)
  if (!script) throw notFound('Roteiro')
  const block = await db.query.scriptBlocks.findFirst({ where: and(eq(scriptBlocks.churchId, ctx.church.id), eq(scriptBlocks.scriptId, script.id), eq(scriptBlocks.id, blockId)) })
  if (!block || (block.type !== 'reading' && block.type !== 'psalm')) throw notFound('Leitura')
  const reference = block.data.reference?.trim()
  if (!block.personId) throw badRequest('no_reader', 'Escolha quem lê antes de avisar.')
  if (!reference) throw badRequest('no_reference', 'Informe a referência da leitura antes de avisar.')
  const person = await db.query.people.findFirst({ where: and(eq(people.churchId, ctx.church.id), eq(people.id, block.personId)) })
  if (!person) throw notFound('Pessoa')
  const service = await loadService(db, ctx, serviceId)
  const msg = await enqueueMessage(db, {
    churchId: ctx.church.id,
    personId: person.id,
    kind: 'reading_notice',
    idempotencyKey: readingNoticeKey(script.id, person.id, block.title, reference),
    params: [firstName(person.displayName), block.title, formatServiceDate(service.startsAt, ctx.church.timezone), ctx.church.name, reference, `${getConfig().appBaseUrl}/i/${ctx.church.slug}/roteiros/${serviceId}`],
  })
  await audit(db, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'script.reader_notified', entityType: 'script', entityId: script.id, data: { personId: person.id } })
  return { status: msg.status, blockedReason: msg.blockedReason }
}

// ---------------------------------------------------------------------------
// Publicação e exportação
// ---------------------------------------------------------------------------

// Publica uma versão imutável: ordem, textos, responsáveis, músicas e dados litúrgicos
// (incluindo a foto do Estêvão usada) ficam copiados na versão.
export async function publishScript(db: Db, ctx: ChurchContext, serviceId: string) {
  requireCoordinator(ctx)
  const view = await getScript(db, ctx, serviceId)
  if (!view.draft) throw notFound('Roteiro')
  const draft = view.draft
  if (!draft.blocks.length) throw badRequest('empty_script', 'O roteiro não tem blocos.')
  const snapshot = draft.snapshot
    ? await db.query.liturgicalSnapshots.findFirst({ where: and(eq(liturgicalSnapshots.churchId, ctx.church.id), eq(liturgicalSnapshots.id, draft.snapshot.id)) })
    : null
  const owners = await db.select({ id: people.id, name: people.displayName }).from(people).where(eq(people.churchId, ctx.church.id))
  const ownerName = new Map(owners.map((o) => [o.id, o.name]))
  const content = {
    title: draft.title,
    service: view.service,
    liturgy: draft.liturgy,
    liturgicalSource: snapshot
      ? { source: snapshot.source, prayerBook: snapshot.prayerBook, fetchedAt: snapshot.fetchedAt, requestPath: snapshot.requestPath, data: snapshot.payload }
      : { source: 'manual' },
    blocks: draft.blocks.map((b) => ({
      id: b.id,
      type: b.type,
      title: b.title,
      body: b.body,
      textSource: b.textSource,
      dutyId: b.dutyId,
      personId: b.personId,
      reference: b.data.reference ?? null,
      responsibles: b.responsibles.map((r) => ({ name: r.name, status: r.status })),
      songs: b.songs.map((s) => ({ title: s!.title, author: s!.author, musicalKey: keyFor(b.data, s!), originalKey: s!.musicalKey, link: s!.link })),
      items: (b.data.items ?? []).map((i) => ({ text: i.text, owner: i.ownerPersonId ? ownerName.get(i.ownerPersonId) ?? null : null, status: i.status })),
    })),
  }
  const result = await db.transaction(async (tx) => {
    const [updated] = await tx.update(serviceScripts).set({
      status: 'published', version: sql`${serviceScripts.version} + 1`, publishedAt: new Date(), publishedByAccountId: ctx.accountId,
    }).where(eq(serviceScripts.id, draft.id)).returning()
    const [ver] = await tx.insert(scriptVersions).values({
      churchId: ctx.church.id, scriptId: draft.id, version: updated!.version, content, publishedByAccountId: ctx.accountId,
    }).returning()
    await audit(tx, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'script.published', entityType: 'script', entityId: draft.id, data: { version: ver!.version } })
    return ver!
  })
  return { version: result.version, publishedAt: result.createdAt }
}

export async function scriptVersionsList(db: Db, ctx: ChurchContext, serviceId: string) {
  const script = await loadScript(db, ctx, serviceId)
  if (!script) return []
  const rows = await db.select().from(scriptVersions).where(and(eq(scriptVersions.churchId, ctx.church.id), eq(scriptVersions.scriptId, script.id))).orderBy(desc(scriptVersions.version))
  return rows.map((r) => {
    const src = (r.content.liturgicalSource ?? {}) as { source?: string, fetchedAt?: string, prayerBook?: string }
    return { version: r.version, publishedAt: r.createdAt, liturgicalSource: { source: src.source ?? 'manual', fetchedAt: src.fetchedAt ?? null, prayerBook: src.prayerBook ?? null } }
  })
}

export async function getPublishedContent(db: Db, ctx: ChurchContext, serviceId: string, version?: number) {
  const script = await loadScript(db, ctx, serviceId)
  if (!script) throw notFound('Roteiro')
  const row = version
    ? await db.query.scriptVersions.findFirst({ where: and(eq(scriptVersions.churchId, ctx.church.id), eq(scriptVersions.scriptId, script.id), eq(scriptVersions.version, version)) })
    : await db.query.scriptVersions.findFirst({ where: and(eq(scriptVersions.churchId, ctx.church.id), eq(scriptVersions.scriptId, script.id)), orderBy: desc(scriptVersions.version) })
  if (!row) throw notFound('Roteiro publicado')
  return { version: row.version, publishedAt: row.createdAt, content: row.content }
}

const STATUS_TEXT: Record<string, string> = { pending: 'a confirmar', confirmed: 'confirmado', declined: 'recusou', not_scheduled: 'fora da escala' }

interface ExportBlock {
  type: string
  title: string
  body: string | null
  reference: string | null
  responsibles: { name: string, status: string }[]
  songs: { title: string, author: string | null, musicalKey: string | null }[]
  items: { text: string, owner: string | null }[]
}

export function exportText(content: Record<string, unknown>, timeZone: string, version: number): string {
  const service = content.service as { title: string, startsAt: string, location: string | null }
  const liturgy = (content.liturgy ?? {}) as { color?: string | null, celebration?: string | null, sundayName?: string | null }
  const lines: string[] = []
  lines.push(String(content.title ?? service.title))
  lines.push(formatServiceDate(new Date(service.startsAt), timeZone) + (service.location ? ` — ${service.location}` : ''))
  const lit = [liturgy.sundayName, liturgy.celebration, liturgy.color && `cor: ${liturgy.color}`].filter(Boolean).join(' · ')
  if (lit) lines.push(lit)
  lines.push(`Versão ${version}`)
  lines.push('')
  for (const b of (content.blocks ?? []) as ExportBlock[]) {
    const who = b.responsibles.length ? ` — ${b.responsibles.map((r) => `${r.name}${r.status !== 'confirmed' ? ` (${STATUS_TEXT[r.status] ?? r.status})` : ''}`).join(', ')}` : ''
    lines.push(`${b.title.toUpperCase()}${who}`)
    if (b.reference) lines.push(b.reference)
    for (const s of b.songs) lines.push(`• ${s.title}${s.author ? ` — ${s.author}` : ''}${s.musicalKey ? ` (${s.musicalKey})` : ''}`)
    for (const i of b.items) lines.push(`• ${i.text}${i.owner ? ` (${i.owner})` : ''}`)
    if (b.body) lines.push(b.body)
    lines.push('')
  }
  return lines.join('\n').trimEnd() + '\n'
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]!))
}

export function exportHtml(content: Record<string, unknown>, timeZone: string, version: number): string {
  const service = content.service as { title: string, startsAt: string, location: string | null }
  const liturgy = (content.liturgy ?? {}) as { color?: string | null, celebration?: string | null, sundayName?: string | null }
  const blocks = (content.blocks ?? []) as ExportBlock[]
  const body = blocks.map((b) => {
    const who = b.responsibles.length ? `<p class="who">${b.responsibles.map((r) => escapeHtml(r.name + (r.status !== 'confirmed' ? ` (${STATUS_TEXT[r.status] ?? r.status})` : ''))).join(', ')}</p>` : ''
    const ref = b.reference ? `<p class="ref">${escapeHtml(b.reference)}</p>` : ''
    const songsHtml = b.songs.length ? `<ul>${b.songs.map((s) => `<li>${escapeHtml(s.title)}${s.author ? ` — ${escapeHtml(s.author)}` : ''}${s.musicalKey ? ` (${escapeHtml(s.musicalKey)})` : ''}</li>`).join('')}</ul>` : ''
    const items = b.items.length ? `<ul>${b.items.map((i) => `<li>${escapeHtml(i.text)}${i.owner ? ` <span class="who">(${escapeHtml(i.owner)})</span>` : ''}</li>`).join('')}</ul>` : ''
    const text = b.body ? `<div class="text">${escapeHtml(b.body).replace(/\n/g, '<br>')}</div>` : ''
    return `<section><h2>${escapeHtml(b.title)}</h2>${who}${ref}${songsHtml}${items}${text}</section>`
  }).join('\n')
  const lit = [liturgy.sundayName, liturgy.celebration, liturgy.color && `cor litúrgica: ${liturgy.color}`].filter(Boolean).map((x) => escapeHtml(String(x))).join(' · ')
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(String(content.title ?? service.title))}</title>
<style>
body{font:17px/1.55 Georgia,'Times New Roman',serif;color:#1d1b18;max-width:40rem;margin:2rem auto;padding:0 1rem}
h1{font-size:1.6rem;margin:0}h2{font-size:1.05rem;text-transform:uppercase;letter-spacing:.04em;margin:1.6rem 0 .3rem;border-top:1px solid #d9d2c5;padding-top:.8rem}
.meta{color:#5b5448;margin:.2rem 0}.who{color:#6b4e16;font-style:italic;margin:.2rem 0}.ref{font-weight:bold;margin:.2rem 0}
@media print{body{margin:0}section{break-inside:avoid}}
</style></head><body>
<h1>${escapeHtml(String(content.title ?? service.title))}</h1>
<p class="meta">${escapeHtml(formatServiceDate(new Date(service.startsAt), timeZone))}${service.location ? ` — ${escapeHtml(service.location)}` : ''}</p>
${lit ? `<p class="meta">${lit}</p>` : ''}
<p class="meta">Versão ${version}</p>
${body}
</body></html>
`
}

// Situação dos roteiros de cada culto do mês.
export async function listScripts(db: Db, ctx: ChurchContext, month: string) {
  const rows = await db.select({ service: services, script: serviceScripts }).from(services)
    .leftJoin(serviceScripts, and(eq(serviceScripts.churchId, services.churchId), eq(serviceScripts.serviceId, services.id)))
    .where(and(eq(services.churchId, ctx.church.id), eq(services.month, month)))
    .orderBy(asc(services.startsAt))
  const draftAllowed = isCoordinator(ctx) || isPastor(ctx)
  return rows.map(({ service, script }) => ({
    serviceId: service.id,
    title: service.title,
    startsAt: service.startsAt,
    localDate: service.localDate,
    time: localParts(service.startsAt, ctx.church.timezone).time,
    status: service.status,
    script: script && (draftAllowed || script.version > 0)
      ? { status: script.status, version: script.version, updatedAt: script.updatedAt, publishedAt: script.publishedAt, hasUnpublishedChanges: script.publishedAt ? script.updatedAt > script.publishedAt : true }
      : null,
  }))
}
