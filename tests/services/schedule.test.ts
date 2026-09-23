import { eq, inArray } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { assignments, outboundMessages, schedulePublications, slots, unavailabilities } from '../../server/db/schema'
import { assignPerson, getPublishedMonth, getScheduleEditor, publishMonth, reassign, removeAssignment, scheduleHistory } from '../../server/services/schedule'
import { makeChurch, makeService, slotOf, useDb, type ChurchFixture } from '../helpers'
import type { Db } from '../../server/db/client'

async function slotsFor(db: Db, serviceId: string) {
  return db.select().from(slots).where(eq(slots.serviceId, serviceId))
}

async function assign(db: Db, f: ChurchFixture, serviceId: string, dutyKey: string, personId: string) {
  const s = await slotsFor(db, serviceId)
  return assignPerson(db, f.coord.ctx, slotOf(s, f.duties[dutyKey]!), { personId, notifyNow: false })
}

describe('escala e alertas', () => {
  const db = useDb()

  it('participante não altera escala nem vê rascunho', async () => {
    const f = await makeChurch(db(), 'porto')
    const svc = await makeService(db(), f, '2026-11-08')
    const s = await slotsFor(db(), svc.id)
    await expect(assignPerson(db(), f.ana.ctx, slotOf(s, f.duties.abertura!), { personId: f.ana.id, notifyNow: false })).rejects.toMatchObject({ status: 403 })
    await expect(getScheduleEditor(db(), f.ana.ctx, '2026-11')).rejects.toMatchObject({ status: 403 })
    await assign(db(), f, svc.id, 'abertura', f.ana.id)
    const view = await getPublishedMonth(db(), f.ana.ctx, '2026-11')
    expect(view.published).toBe(false)
    expect(view.services).toHaveLength(0)
  })

  it('exige motivo para designação excepcional e justificativa para indisponível', async () => {
    const f = await makeChurch(db(), 'porto')
    const svc = await makeService(db(), f, '2026-11-08')
    const s = await slotsFor(db(), svc.id)
    await expect(assignPerson(db(), f.coord.ctx, slotOf(s, f.duties.sermao!), { personId: f.ana.id, notifyNow: false })).rejects.toMatchObject({ code: 'not_qualified' })
    const exc = await assignPerson(db(), f.coord.ctx, slotOf(s, f.duties.sermao!), { personId: f.ana.id, exceptionReason: 'Pregação de testemunho', notifyNow: false })
    expect(exc.exceptional).toBe(true)
    await db().insert(unavailabilities).values({ churchId: f.church.id, personId: f.bruno.id, serviceId: svc.id, source: 'app' })
    await expect(assignPerson(db(), f.coord.ctx, slotOf(s, f.duties.holyrics!), { personId: f.bruno.id, notifyNow: false })).rejects.toMatchObject({ code: 'person_unavailable' })
    await assignPerson(db(), f.coord.ctx, slotOf(s, f.duties.holyrics!), { personId: f.bruno.id, overrideUnavailableReason: 'Combinado por telefone', notifyNow: false })
    const editor = await getScheduleEditor(db(), f.coord.ctx, '2026-11')
    const types = editor.alerts.map((a) => a.type)
    expect(types).toContain('exceptional')
    expect(types).toContain('unavailable')
    await expect(assignPerson(db(), f.coord.ctx, slotOf(s, f.duties.holyrics!), { personId: f.carla.id, notifyNow: false })).rejects.toMatchObject({ code: 'slot_full' })
  })

  it('alertas: vagas, choque, sequencial sem choque, carga no dia, folga e sem tarefa', async () => {
    const f = await makeChurch(db(), 'porto')
    const sundays = ['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29']
    const svcs = []
    for (const d of sundays) svcs.push(await makeService(db(), f, d))
    // Culto extra no mesmo horário de um domingo (outro local) para gerar choque real.
    const extra = await makeService(db(), f, '2026-11-08', '10:00', 'Culto no bairro')
    for (const svc of svcs) await assign(db(), f, svc.id, 'abertura', f.pastor.id)
    for (const svc of svcs) await assign(db(), f, svc.id, 'leitura', f.ana.id)
    await assign(db(), f, svcs[1]!.id, 'cafe', f.ana.id)
    await assign(db(), f, svcs[1]!.id, 'holyrics', f.bruno.id)
    await assign(db(), f, extra.id, 'holyrics', f.bruno.id)
    await assign(db(), f, svcs[1]!.id, 'leitura', f.carla.id)
    await assign(db(), f, svcs[1]!.id, 'louvor', f.carla.id)
    await assign(db(), f, svcs[1]!.id, 'sermao', f.pastor.id)

    const editor = await getScheduleEditor(db(), f.coord.ctx, '2026-11')
    const byType = (t: string) => editor.alerts.filter((a) => a.type === t)
    expect(byType('vacancy').length).toBeGreaterThan(0)
    // Ana tem leitura + café no mesmo culto: sequencial, não é choque.
    expect(byType('clash').filter((a) => a.personId === f.ana.id)).toHaveLength(0)
    // Bruno está em dois cultos sobrepostos.
    expect(byType('clash').filter((a) => a.personId === f.bruno.id)).toHaveLength(1)
    // Carga no dia: Carla tem 2 tarefas (abaixo do limite), pastor tem 2; ninguém com 3.
    expect(byType('same_day_load')).toHaveLength(0)
    // Folga: Ana (voluntária) em todos os domingos aparece; o pastor, não.
    expect(byType('no_rest').map((a) => a.personId)).toEqual([f.ana.id])
    // Sem tarefa: Davi é habilitado e disponível.
    expect(byType('without_task').map((a) => a.personId)).toContain(f.davi.id)
    expect(byType('without_task').map((a) => a.personId)).not.toContain(f.ana.id)
    const anaLoad = editor.loads.find((l) => l.personId === f.ana.id)!
    expect(anaLoad).toMatchObject({ sundaysServed: 5, sundaysFree: 0, tasks: 6 })
    expect(editor.loads.find((l) => l.personId === f.pastor.id)!.restExempt).toBe(true)
  })

  it('publicação versionada; aviso imediato só quando escolhido; mudança posterior guarda versão anterior', async () => {
    const f = await makeChurch(db(), 'porto')
    const svc = await makeService(db(), f, '2026-11-08')
    await assign(db(), f, svc.id, 'abertura', f.ana.id)
    await assign(db(), f, svc.id, 'holyrics', f.davi.id)
    const first = await publishMonth(db(), f.coord.ctx, '2026-11', { notifyNow: false })
    expect(first.version).toBe(1)
    expect(await db().select().from(outboundMessages).where(eq(outboundMessages.kind, 'schedule_published'))).toHaveLength(0)

    const view = await getPublishedMonth(db(), f.ana.ctx, '2026-11')
    expect(view.published).toBe(true)

    const second = await publishMonth(db(), f.coord.ctx, '2026-11', { notifyNow: true })
    expect(second.version).toBe(2)
    const notices = await db().select().from(outboundMessages).where(eq(outboundMessages.kind, 'schedule_published'))
    expect(notices).toHaveLength(2)
    // Davi não tem consentimento: fica bloqueado, visível como pendência.
    expect(notices.find((n) => n.personId === f.davi.id)!.status).toBe('blocked')
    expect(notices.find((n) => n.personId === f.ana.id)!.status).toBe('queued')

    const [a] = await db().select().from(assignments).where(eq(assignments.personId, f.ana.id))
    await reassign(db(), f.coord.ctx, a!.id, { personId: f.bruno.id, reason: 'Ana viajou', notifyNow: false })
    const history = await scheduleHistory(db(), f.coord.ctx, '2026-11')
    expect(history.map((h) => h.version)).toEqual([3, 2, 1])
    expect(history[0]!.kind).toBe('exception')
    expect(history[0]!.justification).toBe('Ana viajou')
    const previous = history[1]!.snapshot as { personId: string }[]
    expect(previous.map((x) => x.personId)).toContain(f.ana.id)
    const current = history[0]!.snapshot as { personId: string }[]
    expect(current.map((x) => x.personId)).not.toContain(f.ana.id)

    await removeAssignment(db(), f.coord.ctx, a!.id, { reason: 'Posto não será usado' })
    const pubs = await db().select().from(schedulePublications)
    expect(pubs).toHaveLength(4)
    expect(await db().select().from(assignments).where(inArray(assignments.id, [a!.id]))).toHaveLength(0)
  })
})
