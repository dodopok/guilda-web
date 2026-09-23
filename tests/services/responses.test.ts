import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { assignments, outboundMessages, slots, swapRequests } from '../../server/db/schema'
import { listSwapCandidates, proposeSwap, respondToAssignment, respondToSwap } from '../../server/services/responses'
import { assignPerson, myTasks, publishMonth } from '../../server/services/schedule'
import { updateService, updateSlot } from '../../server/services/worship'
import { makeChurch, makeService, slotOf, useDb } from '../helpers'

describe('confirmações e trocas', () => {
  const db = useDb()

  async function setup() {
    const f = await makeChurch(db(), 'porto')
    const svc = await makeService(db(), f, '2026-11-08')
    const s = await db().select().from(slots).where(eq(slots.serviceId, svc.id))
    const leitura = await assignPerson(db(), f.coord.ctx, slotOf(s, f.duties.leitura!), { personId: f.ana.id, notifyNow: false })
    const cafe = await assignPerson(db(), f.coord.ctx, slotOf(s, f.duties.cafe!), { personId: f.ana.id, notifyNow: false })
    await publishMonth(db(), f.coord.ctx, '2026-11', { notifyNow: false })
    return { f, svc, s, leitura, cafe }
  }

  it('participante confirma e recusa só as próprias tarefas; recusa avisa a coordenação', async () => {
    const { f, leitura, cafe } = await setup()
    await expect(respondToAssignment(db(), f.bruno.ctx, leitura.id, { decision: 'confirmed' })).rejects.toMatchObject({ status: 404 })
    const ok = await respondToAssignment(db(), f.ana.ctx, leitura.id, { decision: 'confirmed', rowVersion: 1 })
    expect(ok.status).toBe('confirmed')
    await respondToAssignment(db(), f.ana.ctx, cafe.id, { decision: 'declined', note: 'Estarei viajando' })
    const alerts = await db().select().from(outboundMessages).where(eq(outboundMessages.kind, 'coordination_alert'))
    expect(alerts).toHaveLength(1)
    expect(alerts[0]!.personId).toBe(f.coord.id)
    const tasks = await myTasks(db(), f.ana.ctx)
    expect(tasks.map((t) => t.status).sort()).toEqual(['confirmed', 'declined'])
    expect(tasks[0]!.duty.instructions).toContain('Instruções')
  })

  it('mudança na tarefa torna pendente só a confirmação afetada', async () => {
    const { f, s, leitura, cafe } = await setup()
    await respondToAssignment(db(), f.ana.ctx, leitura.id, { decision: 'confirmed' })
    await respondToAssignment(db(), f.ana.ctx, cafe.id, { decision: 'confirmed' })
    await updateSlot(db(), f.coord.ctx, slotOf(s, f.duties.cafe!), { arrivalTime: '08:30' })
    const rows = await db().select().from(assignments).where(eq(assignments.personId, f.ana.id))
    expect(rows.find((r) => r.id === cafe.id)!.status).toBe('pending')
    expect(rows.find((r) => r.id === leitura.id)!.status).toBe('confirmed')
    // Resposta com versão antiga da tarefa é recusada.
    await expect(respondToAssignment(db(), f.ana.ctx, cafe.id, { decision: 'confirmed', rowVersion: 1 })).rejects.toMatchObject({ code: 'stale_assignment' })
  })

  it('substituto precisa ser habilitado para a mesma função; troca só vale após aceite', async () => {
    const { f, leitura } = await setup()
    const candidates = await listSwapCandidates(db(), f.ana.ctx, leitura.id)
    expect(candidates.map((c) => c.personId).sort()).toEqual([f.bruno.id, f.carla.id].sort())
    await expect(proposeSwap(db(), f.ana.ctx, leitura.id, { candidatePersonId: f.davi.id })).rejects.toMatchObject({ code: 'candidate_not_qualified' })
    const swap = await proposeSwap(db(), f.ana.ctx, leitura.id, { candidatePersonId: f.bruno.id })
    let row = await db().query.assignments.findFirst({ where: eq(assignments.id, leitura.id) })
    expect(row!.personId).toBe(f.ana.id)
    await expect(respondToSwap(db(), f.carla.ctx, swap.id, true)).rejects.toMatchObject({ status: 404 })
    await respondToSwap(db(), f.bruno.ctx, swap.id, true)
    row = await db().query.assignments.findFirst({ where: eq(assignments.id, leitura.id) })
    expect(row).toMatchObject({ personId: f.bruno.id, status: 'confirmed' })
    const coordAlerts = await db().select().from(outboundMessages).where(eq(outboundMessages.kind, 'coordination_alert'))
    expect(coordAlerts.map((m) => m.preview).join()).toContain('troca concluída')
  })

  it('duas aceitações simultâneas não deixam dois responsáveis na mesma vaga', async () => {
    const { f, leitura } = await setup()
    const s1 = await proposeSwap(db(), f.ana.ctx, leitura.id, { candidatePersonId: f.bruno.id })
    const s2 = await proposeSwap(db(), f.ana.ctx, leitura.id, { candidatePersonId: f.carla.id })
    const results = await Promise.allSettled([
      respondToSwap(db(), f.bruno.ctx, s1.id, true),
      respondToSwap(db(), f.carla.ctx, s2.id, true),
    ])
    const ok = results.filter((r) => r.status === 'fulfilled')
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
    expect(ok).toHaveLength(1)
    expect(failed).toHaveLength(1)
    expect(failed[0]!.reason).toMatchObject({ code: expect.stringMatching(/swap_stale|swap_closed/) })
    const inSlot = await db().select().from(assignments).where(eq(assignments.slotId, leitura.slotId))
    expect(inSlot).toHaveLength(1)
    const swaps = await db().select().from(swapRequests).where(eq(swapRequests.assignmentId, leitura.id))
    expect(swaps.filter((x) => x.status === 'accepted')).toHaveLength(1)
  })

  it('cancelar o culto torna pendentes as tarefas do culto', async () => {
    const { f, svc, leitura } = await setup()
    await respondToAssignment(db(), f.ana.ctx, leitura.id, { decision: 'confirmed' })
    await updateService(db(), f.coord.ctx, svc.id, { status: 'cancelled', notifyNow: true })
    const row = await db().query.assignments.findFirst({ where: eq(assignments.id, leitura.id) })
    expect(row!.status).toBe('pending')
    const notices = await db().select().from(outboundMessages).where(and(eq(outboundMessages.kind, 'schedule_change'), eq(outboundMessages.personId, f.ana.id)))
    expect(notices).toHaveLength(1)
  })
})
