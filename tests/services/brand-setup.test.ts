import { and, eq, like } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { churches, duties, outboundMessages } from '../../server/db/schema'
import { getLogo, parseLogo, removeLogo, setLogo } from '../../server/services/brand'
import { publicChurch, updateChurch } from '../../server/services/churches'
import { applySetupDuties, completeSetup, setupState } from '../../server/services/setup'
import { remindSilent, scheduleRequest, sendRequestNow, submitAvailability } from '../../server/services/availability'
import { createScript, createTemplate, getScript, notifyReader, replaceBlocks, updateScript } from '../../server/services/liturgy'
import { makeChurch, makeService, useDb } from '../helpers'

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

describe('identidade visual da igreja', () => {
  const db = useDb()

  it('aceita só PNG/JPEG/WebP conferidos pelos bytes; recusa SVG, tipo trocado e excesso de tamanho', () => {
    expect(parseLogo(PNG_1PX).mime).toBe('image/png')
    const svg = `data:image/png;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64')}`
    expect(() => parseLogo(svg)).toThrow(/não parece/)
    expect(() => parseLogo('data:image/svg+xml;base64,PHN2Zz4=')).toThrow(/PNG, JPG ou WebP/)
    const big = `data:image/png;base64,${Buffer.alloc(301 * 1024, 1).toString('base64')}`
    expect(() => parseLogo(big)).toThrow(/300 KB/)
  })

  it('logo e cor: só a coordenação altera; a cor é validada e fica na igreja', async () => {
    const f = await makeChurch(db(), 'porto')
    await expect(setLogo(db(), f.ana.ctx, { dataUrl: PNG_1PX })).rejects.toMatchObject({ status: 403 })
    await setLogo(db(), f.coord.ctx, { dataUrl: PNG_1PX })
    expect((await getLogo(db(), f.church.id))?.mime).toBe('image/png')
    await removeLogo(db(), f.coord.ctx)
    expect(await getLogo(db(), f.church.id)).toBeNull()
    const updated = await updateChurch(db(), f.coord.ctx, { accentColor: '#7a4bd6' })
    expect(publicChurch(updated).accentColor).toBe('#7a4bd6')
    await expect(db().update(churches).set({ accentColor: 'red' }).where(eq(churches.id, f.church.id))).rejects.toThrow()
  })
})

describe('configuração inicial', () => {
  const db = useDb()

  it('cria só as funções escolhidas que faltam, sem duplicar nem apagar, e marca como concluída', async () => {
    const f = await makeChurch(db(), 'nova')
    await db().update(churches).set({ setupCompletedAt: null }).where(eq(churches.id, f.church.id))
    const ctx = { ...f.coord.ctx, church: { ...f.coord.ctx.church, setupCompletedAt: null } }
    const before = await setupState(db(), ctx)
    expect(before.completed).toBe(false)
    expect(before.catalog.find((c) => c.key === 'leitura')?.exists).toBe(true)
    const first = await applySetupDuties(db(), ctx, { keys: ['leitura', 'confissao', 'recepcao'] })
    expect(first.created).toBe(2)
    const again = await applySetupDuties(db(), ctx, { keys: ['leitura', 'confissao', 'recepcao'] })
    expect(again.created).toBe(0)
    const names = (await db().select({ name: duties.name }).from(duties).where(eq(duties.churchId, f.church.id))).map((d) => d.name)
    expect(names).toContain('Recepção')
    expect(names.filter((n) => n === 'Leitura')).toHaveLength(1)
    await expect(applySetupDuties(db(), f.ana.ctx, { keys: ['som'] })).rejects.toMatchObject({ status: 403 })
    await completeSetup(db(), ctx)
    const row = await db().query.churches.findFirst({ where: eq(churches.id, f.church.id) })
    expect(row?.setupCompletedAt).toBeInstanceOf(Date)
  })
})

describe('lembrete a quem está em silêncio', () => {
  const db = useDb()

  it('só para quem não respondeu, no máximo um por pessoa por dia', async () => {
    const f = await makeChurch(db(), 'porto')
    await makeService(db(), f, '2026-11-08')
    await scheduleRequest(db(), f.coord.ctx, '2026-11', { sendAt: new Date(Date.now() + 3600_000), deadlineAt: new Date(Date.now() + 5 * 86400_000) })
    await expect(remindSilent(db(), f.coord.ctx, '2026-11')).rejects.toMatchObject({ code: 'not_sent' })
    await sendRequestNow(db(), f.coord.ctx, '2026-11')
    await submitAvailability(db(), f.ana.ctx, '2026-11', { unavailableServiceIds: [] })
    const first = await remindSilent(db(), f.coord.ctx, '2026-11')
    const again = await remindSilent(db(), f.coord.ctx, '2026-11')
    const reminders = await db().select().from(outboundMessages).where(like(outboundMessages.idempotencyKey, 'availability-remind:%'))
    expect(reminders.length).toBe(first.queued + first.blocked)
    expect(again.queued + again.blocked).toBe(first.queued + first.blocked)
    expect(reminders.some((m) => m.personId === f.ana.id)).toBe(false)
  })
})

describe('roteiro: pastores, avisos fixos e aviso de leitura', () => {
  const db = useDb()

  it('pastor edita o rascunho mas não publica; avisos "todo domingo" voltam no próximo roteiro; rito guarda o texto padrão', async () => {
    const f = await makeChurch(db(), 'porto')
    const t = await createTemplate(db(), f.coord.ctx, {
      name: 'Domingo', kind: 'regular',
      blocks: [
        { type: 'rite', title: 'Abertura', body: '[texto padrão]', textSource: 'loc_manual', dutyId: f.duties.abertura },
        { type: 'reading', title: 'Primeira leitura', textSource: 'church', dutyId: f.duties.leitura },
        { type: 'announcements', title: 'Avisos', textSource: 'church' },
      ],
    })
    const s1 = await makeService(db(), f, '2026-11-08')
    const s2 = await makeService(db(), f, '2026-11-15')
    await createScript(db(), f.coord.ctx, s1.id, t.id)
    const view = await getScript(db(), f.pastor.ctx, s1.id)
    expect(view.canEdit).toBe(true)
    expect((view as { canPublish?: boolean }).canPublish).toBe(false)
    expect(view.draft!.blocks[0]!.data.templateBody).toBe('[texto padrão]')
    const blocks = view.draft!.blocks.map((b) => ({
      type: b.type as 'rite' | 'reading' | 'announcements', title: b.title, body: b.body, textSource: b.textSource as 'church', dutyId: b.dutyId, personId: b.personId,
      data: b.type === 'announcements'
        ? { items: [{ text: 'Café depois do culto', fixed: true, status: 'ready' as const }, { text: 'Retiro no sábado', fixed: false, status: 'ready' as const }] }
        : b.type === 'reading' ? { reference: 'Isaías 55.1-9' } : b.data,
    }))
    blocks[1]!.personId = f.ana.id
    await replaceBlocks(db(), f.pastor.ctx, s1.id, { blocks })
    await expect(replaceBlocks(db(), f.ana.ctx, s1.id, { blocks })).rejects.toMatchObject({ status: 403 })
    await expect(updateScript(db(), f.pastor.ctx, s1.id, { title: 'Outro' })).rejects.toMatchObject({ status: 403 })

    await createScript(db(), f.coord.ctx, s2.id, t.id)
    const next = await getScript(db(), f.coord.ctx, s2.id)
    const avisos = next.draft!.blocks.find((b) => b.type === 'announcements')!
    expect(avisos.data.items?.map((i) => i.text)).toEqual(['Café depois do culto'])

    // Aviso de leitura: idempotente; mudar a referência permite novo aviso.
    const reading = (await getScript(db(), f.coord.ctx, s1.id)).draft!.blocks.find((b) => b.type === 'reading')!
    await notifyReader(db(), f.pastor.ctx, s1.id, reading.id)
    await notifyReader(db(), f.coord.ctx, s1.id, reading.id)
    let notices = await db().select().from(outboundMessages).where(and(eq(outboundMessages.kind, 'reading_notice'), eq(outboundMessages.personId, f.ana.id)))
    expect(notices).toHaveLength(1)
    expect(notices[0]!.preview).toContain('Isaías 55.1-9')
    const after = (await getScript(db(), f.coord.ctx, s1.id)).draft!.blocks.find((b) => b.type === 'reading') as { readerNotified?: boolean }
    expect(after.readerNotified).toBe(true)
    await expect(notifyReader(db(), f.ana.ctx, s1.id, reading.id)).rejects.toMatchObject({ status: 403 })
    const changed = blocks.map((b) => (b.type === 'reading' ? { ...b, data: { reference: 'Isaías 55.10-13' } } : b))
    await replaceBlocks(db(), f.coord.ctx, s1.id, { blocks: changed })
    const newReading = (await getScript(db(), f.coord.ctx, s1.id)).draft!.blocks.find((b) => b.type === 'reading')!
    await notifyReader(db(), f.coord.ctx, s1.id, newReading.id)
    notices = await db().select().from(outboundMessages).where(and(eq(outboundMessages.kind, 'reading_notice'), eq(outboundMessages.personId, f.ana.id)))
    expect(notices).toHaveLength(2)
  })
})
