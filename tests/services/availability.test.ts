import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { outboundMessages, slots } from '../../server/db/schema'
import { availabilityDashboard, getAvailabilityFor, notifyNewServices, runDueAvailabilityRequests, scheduleRequest, sendRequestNow, submitAvailability } from '../../server/services/availability'
import { assignPerson, getScheduleEditor, publishMonth } from '../../server/services/schedule'
import { makeChurch, makeService, slotOf, useDb } from '../helpers'

describe('coleta mensal de indisponibilidades', () => {
  const db = useDb()

  it('exige cultos cadastrados, envia na hora agendada (pode ser antecipada) e não duplica', async () => {
    const f = await makeChurch(db(), 'porto')
    await expect(scheduleRequest(db(), f.coord.ctx, '2026-11', { sendAt: new Date('2026-10-28T12:00:00Z'), deadlineAt: new Date('2026-10-31T23:00:00Z') }))
      .rejects.toMatchObject({ code: 'no_services' })
    await makeService(db(), f, '2026-11-01')
    await makeService(db(), f, '2026-11-08')
    // Primeiro culto cai no dia 1: envio antecipado para o fim de outubro.
    await scheduleRequest(db(), f.coord.ctx, '2026-11', { sendAt: new Date('2026-10-28T12:00:00Z'), deadlineAt: new Date('2026-10-31T23:00:00Z') })
    expect(await runDueAvailabilityRequests(db(), new Date('2026-10-28T11:59:00Z'))).toHaveLength(0)
    const sent = await runDueAvailabilityRequests(db(), new Date('2026-10-28T12:00:30Z'))
    expect(sent).toHaveLength(1)
    const msgs = await db().select().from(outboundMessages).where(eq(outboundMessages.kind, 'availability_request'))
    expect(msgs.length).toBe(6)
    expect(msgs[0]!.preview).toContain('novembro de 2026')
    expect(msgs[0]!.preview).toContain('/i/porto/disponibilidade/2026-11')
    await runDueAvailabilityRequests(db(), new Date('2026-10-28T13:00:00Z'))
    await sendRequestNow(db(), f.coord.ctx, '2026-11')
    expect(await db().select().from(outboundMessages).where(eq(outboundMessages.kind, 'availability_request'))).toHaveLength(6)
  })

  it('pessoa marca só as próprias indisponibilidades; painel diferencia resposta de silêncio', async () => {
    const f = await makeChurch(db(), 'porto')
    const s1 = await makeService(db(), f, '2026-11-01')
    await makeService(db(), f, '2026-11-08')
    await scheduleRequest(db(), f.coord.ctx, '2026-11', { sendAt: new Date(), deadlineAt: new Date(Date.now() + 86400_000) })
    await submitAvailability(db(), f.ana.ctx, '2026-11', { unavailableServiceIds: [s1.id] })
    // Bruno responde que pode em todos (lista vazia) — é resposta, não silêncio.
    await submitAvailability(db(), f.bruno.ctx, '2026-11', { unavailableServiceIds: [] })
    await expect(submitAvailability(db(), f.ana.ctx, '2026-11', { unavailableServiceIds: [] }, f.bruno.id)).rejects.toMatchObject({ status: 403 })
    const dash = await availabilityDashboard(db(), f.coord.ctx, '2026-11')
    const row = (id: string) => dash.people.find((p) => p.personId === id)!
    expect(row(f.ana.id)).toMatchObject({ responded: true, unavailableServiceIds: [s1.id] })
    expect(row(f.bruno.id)).toMatchObject({ responded: true, unavailableServiceIds: [] })
    expect(row(f.carla.id).responded).toBe(false)
    expect(dash.summary.silent).toBe(dash.summary.people - 2)
    const mine = await getAvailabilityFor(db(), f.ana.ctx, '2026-11')
    expect(mine.services.find((s) => s.id === s1.id)!.unavailable).toBe(true)
    // Coordenação registra resposta recebida por outro canal, com origem.
    await submitAvailability(db(), f.coord.ctx, '2026-11', { unavailableServiceIds: [], note: 'Respondeu no grupo' }, f.carla.id)
    const dash2 = await availabilityDashboard(db(), f.coord.ctx, '2026-11')
    expect(dash2.people.find((p) => p.personId === f.carla.id)).toMatchObject({ responded: true, source: 'coordination' })
  })

  it('indisponibilidade depois da publicação alerta a coordenação sem alterar a escala; culto novo gera aviso', async () => {
    const f = await makeChurch(db(), 'porto')
    const svc = await makeService(db(), f, '2026-11-08')
    await scheduleRequest(db(), f.coord.ctx, '2026-11', { sendAt: new Date(), deadlineAt: new Date(Date.now() + 86400_000) })
    await sendRequestNow(db(), f.coord.ctx, '2026-11')
    const s = await db().select().from(slots).where(eq(slots.serviceId, svc.id))
    const a = await assignPerson(db(), f.coord.ctx, slotOf(s, f.duties.leitura!), { personId: f.ana.id, notifyNow: false })
    await publishMonth(db(), f.coord.ctx, '2026-11', { notifyNow: false })
    const res = await submitAvailability(db(), f.ana.ctx, '2026-11', { unavailableServiceIds: [svc.id] })
    expect(res.conflictsWithSchedule).toBe(1)
    const editor = await getScheduleEditor(db(), f.coord.ctx, '2026-11')
    const alert = editor.alerts.find((x) => x.type === 'unavailable')!
    expect(alert.late).toBe(true)
    expect(editor.services[0]!.slots.flatMap((x) => x.assignments).map((x) => x.id)).toContain(a.id)
    const coordMsgs = await db().select().from(outboundMessages).where(eq(outboundMessages.kind, 'coordination_alert'))
    expect(coordMsgs).toHaveLength(1)

    await makeService(db(), f, '2026-11-20', '19:30', 'Culto de ação de graças')
    const r = await notifyNewServices(db(), f.coord.ctx, '2026-11')
    expect(r.services).toBe(1)
    await expect(notifyNewServices(db(), f.coord.ctx, '2026-11')).resolves.toMatchObject({ services: 1 })
    const updates = await db().select().from(outboundMessages).where(eq(outboundMessages.kind, 'availability_request'))
    expect(updates.filter((m) => m.idempotencyKey.startsWith('availability-new:'))).toHaveLength(6)
  })
})
