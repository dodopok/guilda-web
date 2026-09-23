import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { liturgicalSnapshots, outboundMessages, slots } from '../../server/db/schema'
import {
  applySuggestions, createScript, createSong, createTemplate, duplicateTemplate, exportHtml, exportText, fetchSuggestions,
  getPublishedContent, getScript, notifyMusic, publishScript, replaceBlocks, setMusic, updateScript,
} from '../../server/services/liturgy'
import { assignPerson, publishMonth, reassign } from '../../server/services/schedule'
import { makeChurch, makeService, slotOf, useDb, type ChurchFixture } from '../helpers'
import type { Db } from '../../server/db/client'

const dayJson = readFileSync('tests/fixtures/estevao-day.json', 'utf8')
const okFetch = vi.fn(async () => new Response(dayJson, { status: 200, headers: { 'content-type': 'application/json' } }))
const downFetch = vi.fn(async () => { throw new Error('connect ECONNREFUSED') })

async function baseTemplate(db: Db, f: ChurchFixture) {
  return createTemplate(db, f.coord.ctx, {
    name: 'Domingo comum',
    kind: 'regular',
    blocks: [
      { type: 'rite', title: 'Abertura', body: '[Texto do LOC cadastrado pela coordenação]', textSource: 'loc_manual', dutyId: f.duties.abertura },
      { type: 'collect', title: 'Coleta', body: null, textSource: 'church' },
      { type: 'music', title: 'Músicas', textSource: 'church' },
      { type: 'reading', title: 'Leitura', textSource: 'church', dutyId: f.duties.leitura },
      { type: 'sermon', title: 'Sermão', textSource: 'church', dutyId: f.duties.sermao },
      { type: 'announcements', title: 'Avisos', textSource: 'church' },
    ],
  })
}

async function setup(db: Db) {
  const f = await makeChurch(db, 'porto')
  const svc = await makeService(db, f, '2026-11-08')
  const s = await db.select().from(slots).where(eq(slots.serviceId, svc.id))
  await assignPerson(db, f.coord.ctx, slotOf(s, f.duties.abertura!), { personId: f.ana.id, notifyNow: false })
  await assignPerson(db, f.coord.ctx, slotOf(s, f.duties.sermao!), { personId: f.pastor.id, notifyNow: false })
  await assignPerson(db, f.coord.ctx, slotOf(s, f.duties.leitura!), { personId: f.bruno.id, notifyNow: false })
  await assignPerson(db, f.coord.ctx, slotOf(s, f.duties.leitura!), { personId: f.carla.id, notifyNow: false })
  await assignPerson(db, f.coord.ctx, slotOf(s, f.duties.louvor!), { personId: f.carla.id, notifyNow: false })
  await assignPerson(db, f.coord.ctx, slotOf(s, f.duties.louvor!), { personId: f.bruno.id, notifyNow: false })
  await publishMonth(db, f.coord.ctx, '2026-11', { notifyNow: false })
  const t = await baseTemplate(db, f)
  await createScript(db, f.coord.ctx, svc.id, t.id)
  return { f, svc, s, t }
}

describe('roteiro de liturgia e Estêvão', () => {
  const db = useDb()

  it('roteiro nasce do modelo e da escala, sem digitar nomes', async () => {
    const { f, svc } = await setup(db())
    const view = await getScript(db(), f.coord.ctx, svc.id)
    const abertura = view.draft!.blocks.find((b) => b.title === 'Abertura')!
    expect(abertura.responsibles.map((r) => r.name)).toEqual(['Ana Lima'])
    expect(abertura.responsibles[0]!.status).toBe('pending')
    const leitura = view.draft!.blocks.find((b) => b.type === 'reading')!
    expect(leitura.responsibles.map((r) => r.name).sort()).toEqual(['Bruno Reis', 'Carla Dias'])
  })

  it('aplica coleta e número variável de leituras do Estêvão; não guarda texto bíblico; atribui leitura a uma pessoa', async () => {
    const { f, svc } = await setup(db())
    const sug = await fetchSuggestions(db(), f.coord.ctx, svc.id, okFetch as unknown as typeof fetch)
    expect(sug.ok).toBe(true)
    if (!sug.ok) return
    expect(sug.suggestion.readings.map((r) => r.key)).toEqual(['first_reading', 'psalm', 'second_reading', 'gospel'])
    const snap = await db().query.liturgicalSnapshots.findFirst({ where: eq(liturgicalSnapshots.id, sug.snapshotId) })
    expect(JSON.stringify(snap!.payload)).not.toContain('TEXTO BÍBLICO')
    expect(snap!.requestPath).toContain('/api/v2/days/')
    expect(snap!.requestPath).toContain('book=loc_2027')
    expect(snap!.requestPath).not.toContain('readings.text')
    const call = okFetch.mock.calls[0] as unknown as [string, RequestInit]
    expect((call[1].headers as Record<string, string>)['X-API-Key']).toBe('test-key')

    const picked = sug.suggestion.readings.filter((r) => r.key !== 'second_reading')
    const view = await applySuggestions(db(), f.coord.ctx, svc.id, {
      snapshotId: sug.snapshotId, collectIndex: 0, readings: picked.map((r) => ({ key: r.key, reference: r.reference, label: r.label })), replaceReadings: true, applyCalendar: true,
    })
    const blocks = view.draft!.blocks
    expect(blocks.filter((b) => b.type === 'reading' || b.type === 'psalm').map((b) => b.data.reference)).toEqual(['Am 5.18-24', 'Sl 70', 'Mt 25.1-13'])
    expect(blocks.find((b) => b.type === 'collect')!.body).toContain('coleta para teste')
    expect(view.draft!.liturgy).toMatchObject({ color: 'verde', sundayName: 'Domingo Próprio 27', source: 'estevao' })

    // Atribui a primeira leitura só ao Bruno (a escala tem duas pessoas na Leitura).
    const edited = blocks.map((b) => ({ ...b, personId: b.data.reference === 'Am 5.18-24' ? f.bruno.id : b.personId }))
    const v2 = await replaceBlocks(db(), f.coord.ctx, svc.id, { blocks: edited.map((b) => ({ type: b.type as 'reading', title: b.title, body: b.body, textSource: b.textSource as 'church', dutyId: b.dutyId, personId: b.personId, data: b.data })) })
    expect(v2.draft!.blocks.find((b) => b.data.reference === 'Am 5.18-24')!.responsibles.map((r) => r.name)).toEqual(['Bruno Reis'])
  })

  it('modelo com nome do domingo e posições de leitura: Estêvão preenche só o marcado e mantém quem lê', async () => {
    const f = await makeChurch(db(), 'porto')
    const svc = await makeService(db(), f, '2026-11-08')
    const t = await createTemplate(db(), f.coord.ctx, {
      name: 'Com posições',
      kind: 'regular',
      blocks: [
        { type: 'heading', title: 'Nome do domingo', textSource: 'estevao' },
        { type: 'reading', title: 'Primeira leitura', textSource: 'estevao', dutyId: f.duties.leitura },
        { type: 'psalm', title: 'Salmo', textSource: 'estevao', dutyId: f.duties.leitura },
        { type: 'reading', title: 'Evangelho', textSource: 'estevao', dutyId: f.duties.leitura },
      ],
    })
    await createScript(db(), f.coord.ctx, svc.id, t.id)
    const created = await getScript(db(), f.coord.ctx, svc.id)
    expect(created.draft!.blocks.filter((b) => b.type !== 'heading').map((b) => b.data.slot)).toEqual(['first_reading', 'psalm', 'gospel'])
    // Quem guia o salmo é escolhido antes de buscar as leituras.
    const withReader = created.draft!.blocks.map((b) => ({ type: b.type as 'reading', title: b.title, body: b.body, textSource: b.textSource as 'church', dutyId: b.dutyId, personId: b.type === 'psalm' ? f.carla.id : b.personId, data: b.data }))
    await replaceBlocks(db(), f.coord.ctx, svc.id, { blocks: withReader })

    const json = JSON.parse(dayJson)
    json.data.sunday_name = '32º Domingo no Tempo Comum'
    json.data.description = ['Próprio 27']
    const fetch2 = vi.fn(async () => new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } }))
    const sug = await fetchSuggestions(db(), f.coord.ctx, svc.id, fetch2 as unknown as typeof fetch)
    if (!sug.ok) throw new Error('sugestão')
    const wanted = sug.suggestion.readings.filter((r) => ['first_reading', 'psalm', 'gospel'].includes(r.key))
    const view = await applySuggestions(db(), f.coord.ctx, svc.id, {
      snapshotId: sug.snapshotId, collectIndex: 0, readings: wanted.map((r) => ({ key: r.key, reference: r.reference, label: r.label })), replaceReadings: true, applyCalendar: true,
    })
    const blocks = view.draft!.blocks
    expect(blocks[0]!.title).toBe('32º Domingo no Tempo Comum (Próprio 27)')
    expect(blocks[1]!.type).toBe('collect')
    expect(blocks.slice(2).map((b) => [b.data.slot, b.data.reference])).toEqual([['first_reading', 'Am 5.18-24'], ['psalm', 'Sl 70'], ['gospel', 'Mt 25.1-13']])
    expect(blocks.find((b) => b.type === 'psalm')!.responsibles.map((r) => r.name)).toEqual(['Carla Dias'])
  })

  it('falha do Estêvão não impede o roteiro: preenchimento manual continua', async () => {
    const { f, svc } = await setup(db())
    const res = await fetchSuggestions(db(), f.coord.ctx, svc.id, downFetch as unknown as typeof fetch)
    expect(res.ok).toBe(false)
    const view = await updateScript(db(), f.coord.ctx, svc.id, { liturgy: { color: 'verde', sundayName: 'Preenchido à mão' } })
    expect(view.draft!.liturgy).toMatchObject({ source: 'manual', sundayName: 'Preenchido à mão' })
    const pub = await publishScript(db(), f.coord.ctx, svc.id)
    expect(pub.version).toBe(1)
  })

  it('versão publicada fica estável e sinaliza revisão quando a escala muda', async () => {
    const { f, svc } = await setup(db())
    const sug = await fetchSuggestions(db(), f.coord.ctx, svc.id, okFetch as unknown as typeof fetch)
    if (!sug.ok) throw new Error('sugestão')
    await applySuggestions(db(), f.coord.ctx, svc.id, { snapshotId: sug.snapshotId, collectIndex: 0, readings: [], replaceReadings: false, applyCalendar: true })
    await publishScript(db(), f.coord.ctx, svc.id)
    const before = await getPublishedContent(db(), f.coord.ctx, svc.id)
    // Estêvão "muda de ideia" depois: nova busca não altera o publicado.
    await db().update(liturgicalSnapshots).set({ payload: { changed: true } })
    const view = await getScript(db(), f.ana.ctx, svc.id)
    expect(view.draft).toBeNull()
    expect(view.needsReview!.required).toBe(false)
    // Troca na escala depois da publicação.
    const aberturaAssignment = (await db().query.assignments.findFirst({ where: (a, { eq: e }) => e(a.personId, f.ana.id) }))!
    await reassign(db(), f.coord.ctx, aberturaAssignment.id, { personId: f.pastor.id, reason: 'Ana doente', notifyNow: false })
    const after = await getScript(db(), f.coord.ctx, svc.id)
    expect(after.needsReview!.required).toBe(true)
    expect(after.needsReview!.changes[0]).toMatchObject({ blockTitle: 'Abertura', published: ['Ana Lima'], current: ['Pastor Paulo'] })
    const still = await getPublishedContent(db(), f.coord.ctx, svc.id)
    expect(still).toEqual(before)
    const liturgicalSource = still.content.liturgicalSource as { source: string, data: { color: string } }
    expect(liturgicalSource.source).toBe('estevao')
    expect(liturgicalSource.data.color).toBe('verde')
    const txt = exportText(still.content, 'America/Sao_Paulo', still.version)
    expect(txt).toContain('ABERTURA — Ana Lima (a confirmar)')
    expect(txt).toContain('domingo, 08/11 às 9h30')
    const html = exportHtml(still.content, 'America/Sao_Paulo', still.version)
    expect(html).toContain('<h2>Abertura</h2>')
  })

  it('pregador escolhe músicas; aviso vai só ao louvor do culto e não se repete', async () => {
    const { f, svc } = await setup(db())
    const a = await createSong(db(), f.pastor.ctx, { title: 'Cântico A', musicalKey: 'D' })
    const b = await createSong(db(), f.pastor.ctx, { title: 'Cântico B' })
    await expect(setMusic(db(), f.ana.ctx, svc.id, { songIds: [a.id] })).rejects.toMatchObject({ status: 403 })
    await setMusic(db(), f.pastor.ctx, svc.id, { songIds: [a.id, b.id] })
    const r = await notifyMusic(db(), f.pastor.ctx, svc.id)
    expect(r.recipients).toBe(2)
    await notifyMusic(db(), f.pastor.ctx, svc.id)
    const msgs = await db().select().from(outboundMessages).where(eq(outboundMessages.kind, 'music_notice'))
    expect(msgs.map((m) => m.personId).sort()).toEqual([f.bruno.id, f.carla.id].sort())
    expect(msgs[0]!.preview).toContain('Cântico A (D), Cântico B')
  })

  it('modelos duplicáveis para celebração especial e culto curto', async () => {
    const { f, t } = await setup(db())
    const curto = await duplicateTemplate(db(), f.coord.ctx, t.id, { name: 'Culto curto', kind: 'short' })
    expect(curto.kind).toBe('short')
    const svc2 = await makeService(db(), f, '2026-11-11', '19:30', 'Culto especial')
    await createScript(db(), f.coord.ctx, svc2.id, curto.id)
    const view = await replaceBlocks(db(), f.coord.ctx, svc2.id, { blocks: [
      { type: 'rite', title: 'Vela do Advento', body: 'Texto próprio', textSource: 'church', data: {} },
      { type: 'announcements', title: 'Avisos', textSource: 'church', data: { items: [{ text: 'Retiro no sábado', status: 'ready' }] } },
    ] })
    expect(view.draft!.blocks.map((b) => b.title)).toEqual(['Vela do Advento', 'Avisos'])
    await expect(publishScript(db(), f.ana.ctx, svc2.id)).rejects.toMatchObject({ status: 403 })
  })
})
