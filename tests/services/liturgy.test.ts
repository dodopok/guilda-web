import { readFileSync } from 'node:fs'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { liturgicalSnapshots, outboundMessages, slots } from '../../server/db/schema'
import {
  applySuggestions, createScript, createSong, createTemplate, duplicateTemplate, exportHtml, exportText, fetchSuggestions,
  getPublishedContent, getScript, getTemplate, lookupSongKey, notifyMusic, publishScript, rebuildFromTemplate, replaceBlocks, searchSongs, setMusic, updateScript, updateTemplate,
} from '../../server/services/liturgy'
import { assignPerson, publishMonth, reassign } from '../../server/services/schedule'
import { createDuty } from '../../server/services/catalog'
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

  it('refazer pelo modelo mantém o que foi preenchido; avisa modelo alterado e funções fora do roteiro', async () => {
    const { f, svc, t } = await setup(db())
    let view = await getScript(db(), f.coord.ctx, svc.id)
    expect(view.draft!.template).toMatchObject({ id: t.id, name: 'Domingo comum', changedSince: false })
    // O modelo base mostra abertura, leitura e sermão; o louvor escalado não tem bloco com a função.
    const outside1 = view.draft!.dutiesOutside.map((d) => d.id)
    expect(outside1).toContain(f.duties.louvor)
    expect(outside1).not.toContain(f.duties.abertura)
    expect(outside1).not.toContain(f.duties.leitura)
    // Funções de apoio ficam só na escala.
    expect(outside1).not.toContain(f.duties.cafe)
    expect(outside1).not.toContain(f.duties.holyrics)

    const sug = await fetchSuggestions(db(), f.coord.ctx, svc.id, okFetch as unknown as typeof fetch)
    if (!sug.ok) throw new Error('sugestão')
    view = await applySuggestions(db(), f.coord.ctx, svc.id, {
      snapshotId: sug.snapshotId, collectIndex: 0, readings: sug.suggestion.readings.map((r) => ({ key: r.key, reference: r.reference, label: r.label })), replaceReadings: true, applyCalendar: true,
    })
    const edited = view.draft!.blocks.map((b) => ({ type: b.type as 'reading', title: b.title, body: b.body, textSource: b.textSource as 'church', dutyId: b.dutyId, personId: b.data.slot === 'first_reading' ? f.bruno.id : b.personId, data: b.data }))
    await replaceBlocks(db(), f.coord.ctx, svc.id, { blocks: edited })
    const song = await createSong(db(), f.coord.ctx, { title: 'Cântico', musicalKey: 'D' })
    await setMusic(db(), f.coord.ctx, svc.id, { songIds: [song.id], songKeys: { [song.id]: 'E' } })

    await updateTemplate(db(), f.coord.ctx, t.id, { name: 'Domingo comum' })
    expect((await getScript(db(), f.coord.ctx, svc.id)).draft!.template!.changedSince).toBe(true)

    const novo = await createTemplate(db(), f.coord.ctx, {
      name: 'Nova ordem',
      kind: 'regular',
      blocks: [
        { type: 'heading', title: 'Nome do domingo', textSource: 'estevao' },
        { type: 'collect', title: 'Coleta do dia', textSource: 'estevao' },
        { type: 'reading', title: 'Primeira leitura', textSource: 'estevao', dutyId: f.duties.leitura },
        { type: 'psalm', title: 'Salmo', textSource: 'estevao', dutyId: f.duties.leitura },
        { type: 'reading', title: 'Evangelho', textSource: 'estevao', dutyId: f.duties.leitura },
        { type: 'music', title: 'Músicas', textSource: 'church', dutyId: f.duties.louvor },
      ],
    })
    const rebuilt = await rebuildFromTemplate(db(), f.coord.ctx, svc.id, novo.id)
    const blocks = rebuilt.draft!.blocks
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'collect', 'reading', 'psalm', 'reading', 'music'])
    expect(blocks[0]!.title).toBe('Domingo Próprio 27')
    expect(blocks[1]!.body).toContain('coleta para teste')
    expect(blocks.slice(2, 5).map((b) => b.data.reference)).toEqual(['Am 5.18-24', 'Sl 70', 'Mt 25.1-13'])
    expect(blocks[2]!.responsibles.map((r) => r.name)).toEqual(['Bruno Reis'])
    expect(blocks[5]!.data).toMatchObject({ songIds: [song.id], songKeys: { [song.id]: 'E' } })
    expect(rebuilt.draft!.template).toMatchObject({ id: novo.id, changedSince: false })
    const outside2 = rebuilt.draft!.dutiesOutside.map((d) => d.id)
    expect(outside2).toEqual(expect.arrayContaining([f.duties.abertura, f.duties.sermao]))
    expect(outside2).not.toContain(f.duties.louvor)
    await expect(rebuildFromTemplate(db(), f.ana.ctx, svc.id, novo.id)).rejects.toMatchObject({ status: 403 })
  })

  it('salvar o modelo pode atualizar os próximos roteiros ainda não publicados', async () => {
    const { f, svc, t } = await setup(db())
    const svc2 = await makeService(db(), f, '2026-11-15')
    await createScript(db(), f.coord.ctx, svc2.id, t.id)
    await publishScript(db(), f.coord.ctx, svc2.id)
    // Quem lê já escolhido no roteiro não publicado continua depois da atualização.
    const before = await getScript(db(), f.coord.ctx, svc.id)
    const edited = before.draft!.blocks.map((b) => ({ type: b.type as 'reading', title: b.title, body: b.body, textSource: b.textSource as 'church', dutyId: b.dutyId, personId: b.type === 'reading' ? f.carla.id : b.personId, data: b.data }))
    await replaceBlocks(db(), f.coord.ctx, svc.id, { blocks: edited })
    expect((await getTemplate(db(), f.coord.ctx, t.id)).upcomingDrafts).toBe(1)

    const tpl = await getTemplate(db(), f.coord.ctx, t.id)
    const blocks = [{ type: 'heading' as const, title: 'Nome do domingo', textSource: 'estevao' as const }, ...tpl.blocks.map((b) => ({ type: b.type as 'rite', title: b.title, body: b.body, textSource: b.textSource as 'church', dutyId: b.dutyId }))]
    const r = await updateTemplate(db(), f.coord.ctx, t.id, { blocks, applyToUpcoming: true })
    expect(r.updatedScripts).toBe(1)
    const after = await getScript(db(), f.coord.ctx, svc.id)
    expect(after.draft!.blocks[0]!.type).toBe('heading')
    expect(after.draft!.blocks.find((b) => b.type === 'reading')!.personId).toBe(f.carla.id)
    expect(after.draft!.template!.changedSince).toBe(false)
    // O publicado fica como estava e passa a avisar que o modelo mudou.
    const published = await getScript(db(), f.coord.ctx, svc2.id)
    expect(published.draft!.blocks[0]!.type).not.toBe('heading')
    expect(published.draft!.template!.changedSince).toBe(true)
  })

  it('função nova aparece no roteiro por padrão só se for da liturgia', async () => {
    const f = await makeChurch(db(), 'porto')
    const catalog = await db().query.duties.findMany({ where: (d, { eq: e }) => e(d.churchId, f.church.id) })
    const ministryOf = (id: string) => catalog.find((d) => d.id === id)!.ministryId
    const lit = await createDuty(db(), f.coord.ctx, { ministryId: ministryOf(f.duties.abertura!), name: 'Intercessão', kind: 'general', receivesMusicNotice: false, defaultRequiredCount: 1, includeByDefault: true, active: true })
    const apoio = await createDuty(db(), f.coord.ctx, { ministryId: ministryOf(f.duties.cafe!), name: 'Chá', kind: 'general', receivesMusicNotice: false, defaultRequiredCount: 1, includeByDefault: true, active: true })
    const marcada = await createDuty(db(), f.coord.ctx, { ministryId: ministryOf(f.duties.cafe!), name: 'Ceia', kind: 'general', inScript: true, receivesMusicNotice: false, defaultRequiredCount: 1, includeByDefault: true, active: true })
    expect([lit.inScript, apoio.inScript, marcada.inScript]).toEqual([true, false, true])
  })

  it('tom original lido da cifra só preenche quando o repertório não tem tom', async () => {
    const { f } = await setup(db())
    const link = 'https://www.cifraclub.com.br/artista-de-exemplo/cancao/'
    const page = vi.fn(async () => new Response('<span id="cifra_tom">tom: <a>A</a></span>', { status: 200 }))
    const s1 = await createSong(db(), f.coord.ctx, { title: 'Canção', link })
    const r1 = await lookupSongKey(db(), f.coord.ctx, s1.id, page as unknown as typeof fetch)
    expect(r1).toMatchObject({ song: { musicalKey: 'A' }, keyLookup: { status: 'found', key: 'A' } })
    const s2 = await createSong(db(), f.coord.ctx, { title: 'Outra', musicalKey: 'C', link: 'https://www.cifraclub.com.br/artista-de-exemplo/outra/' })
    const r2 = await lookupSongKey(db(), f.coord.ctx, s2.id, page as unknown as typeof fetch)
    expect(r2.song.musicalKey).toBe('C')
    const s3 = await createSong(db(), f.coord.ctx, { title: 'Sem link' })
    expect((await lookupSongKey(db(), f.coord.ctx, s3.id)).keyLookup.status).toBe('not_found')
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
    expect(msgs[0]!.preview).toContain('Cântico A (tom D), Cântico B')
  })

  it('música da busca entra no repertório uma vez; tom do culto muda o aviso e o publicado', async () => {
    const { f, svc } = await setup(db())
    const link = 'https://www.cifraclub.com.br/artista-de-exemplo/cancao-de-exemplo/'
    const a = await createSong(db(), f.pastor.ctx, { title: 'Canção de exemplo', author: 'Artista de Exemplo', link })
    const again = await createSong(db(), f.coord.ctx, { title: 'Canção de exemplo', author: 'Artista de Exemplo', link })
    expect(again.id).toBe(a.id)
    const b = await createSong(db(), f.pastor.ctx, { title: 'Cântico B', musicalKey: 'D' })

    await setMusic(db(), f.pastor.ctx, svc.id, { songIds: [a.id, b.id], songKeys: { [a.id]: 'G', [b.id]: '' } })
    const view = await getScript(db(), f.coord.ctx, svc.id)
    expect(view.draft!.blocks.find((x) => x.type === 'music')!.data.songKeys).toEqual({ [a.id]: 'G' })
    await notifyMusic(db(), f.pastor.ctx, svc.id)
    // Mudar só o tom gera novo aviso.
    await setMusic(db(), f.pastor.ctx, svc.id, { songIds: [a.id, b.id], songKeys: { [a.id]: 'A', [b.id]: 'E' } })
    await notifyMusic(db(), f.pastor.ctx, svc.id)
    const previews = (await db().select().from(outboundMessages).where(and(eq(outboundMessages.kind, 'music_notice'), eq(outboundMessages.personId, f.bruno.id)))).map((m) => m.preview)
    expect(previews.length).toBe(2)
    expect(previews.some((p) => p?.includes('Canção de exemplo (tom G), Cântico B (tom D)'))).toBe(true)
    expect(previews.some((p) => p?.includes('Canção de exemplo (tom A), Cântico B (tom E)'))).toBe(true)

    await publishScript(db(), f.coord.ctx, svc.id)
    const pub = await getPublishedContent(db(), f.coord.ctx, svc.id)
    const music = (pub.content.blocks as { type: string, songs: { musicalKey: string | null, originalKey: string | null, link: string | null }[] }[]).find((x) => x.type === 'music')!
    expect(music.songs).toEqual([
      { title: 'Canção de exemplo', author: 'Artista de Exemplo', musicalKey: 'A', originalKey: null, link },
      { title: 'Cântico B', author: null, musicalKey: 'E', originalKey: 'D', link: null },
    ])
  })

  it('busca no Cifra Club: só músicas, link montado com segurança; falha não quebra', async () => {
    const { f } = await setup(db())
    const payload = { response: { docs: [
      { tipo: '1', art: 'Artista', dns: 'artista' },
      { tipo: '2', art: 'Artista', txt: 'Canção', dns: 'artista', url: 'cancao' },
      { tipo: '2', art: 'X', txt: 'Ruim', dns: '../evil', url: 'x' },
    ] } }
    const ok = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }))
    const r = await searchSongs(db(), f.pastor.ctx, 'canção', ok as unknown as typeof fetch)
    expect(r).toEqual({ available: true, hits: [{ title: 'Canção', artist: 'Artista', link: 'https://www.cifraclub.com.br/artista/cancao/' }] })
    const call = ok.mock.calls[0] as unknown as [string]
    expect(call[0]).toBe('https://busca.example.test/cc/?q=can%C3%A7%C3%A3o&wt=json')
    const down = await searchSongs(db(), f.pastor.ctx, 'outra busca', downFetch as unknown as typeof fetch)
    expect(down).toMatchObject({ available: false, hits: [] })
    await expect(searchSongs(db(), f.ana.ctx, 'canção', ok as unknown as typeof fetch)).rejects.toMatchObject({ status: 403 })
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
