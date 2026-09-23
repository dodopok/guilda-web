import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { churches, outboundMessages, reminderRuns, slots } from '../../server/db/schema'
import { respondToAssignment, proposeSwap, respondToSwap } from '../../server/services/responses'
import { runDueReminders, syncReminderCorrections } from '../../server/services/reminders'
import { assignPerson, publishMonth, removeAssignment } from '../../server/services/schedule'
import { workerTick } from '../../server/services/worker-tick'
import { makeChurch, makeService, slotOf, useDb } from '../helpers'

// Quinta-feira 05/11/2026 às 19h em São Paulo = 22h UTC.
const DUE = new Date('2026-11-05T22:00:00Z')

describe('lembretes semanais', () => {
  const db = useDb()

  async function setup() {
    const f = await makeChurch(db(), 'porto')
    await db().update(churches).set({ reminderEnabled: true, reminderWeekday: 4, reminderTime: '19:00', reminderConfigUpdatedAt: new Date('2026-10-01T00:00:00Z') }).where(eq(churches.id, f.church.id))
    const church = (await db().query.churches.findFirst({ where: eq(churches.id, f.church.id) }))!
    const sunday = await makeService(db(), f, '2026-11-08')
    const later = await makeService(db(), f, '2026-11-15')
    const s1 = await db().select().from(slots).where(eq(slots.serviceId, sunday.id))
    const s2 = await db().select().from(slots).where(eq(slots.serviceId, later.id))
    const a1 = await assignPerson(db(), f.coord.ctx, slotOf(s1, f.duties.leitura!), { personId: f.ana.id, notifyNow: false })
    const a2 = await assignPerson(db(), f.coord.ctx, slotOf(s1, f.duties.cafe!), { personId: f.ana.id, notifyNow: false })
    const b1 = await assignPerson(db(), f.coord.ctx, slotOf(s1, f.duties.leitura!), { personId: f.bruno.id, notifyNow: false })
    const d1 = await assignPerson(db(), f.coord.ctx, slotOf(s1, f.duties.holyrics!), { personId: f.davi.id, notifyNow: false })
    await assignPerson(db(), f.coord.ctx, slotOf(s2, f.duties.leitura!), { personId: f.carla.id, notifyNow: false })
    await publishMonth(db(), f.coord.ctx, '2026-11', { notifyNow: false })
    return { f, church, sunday, s1, a1, a2, b1, d1 }
  }

  it('dispara no instante configurado em America/Sao_Paulo, uma mensagem por pessoa, sem duplicar', async () => {
    const { f } = await setup()
    expect(await runDueReminders(db(), new Date(DUE.getTime() - 60_000))).toHaveLength(0)
    const runs = await runDueReminders(db(), DUE)
    expect(runs).toHaveLength(1)
    const reminders = await db().select().from(outboundMessages).where(eq(outboundMessages.kind, 'weekly_reminder'))
    // Ana (2 tarefas, 1 mensagem), Bruno e Davi. Carla só serve fora da janela de 7 dias.
    expect(reminders.map((r) => r.personId).sort()).toEqual([f.ana.id, f.bruno.id, f.davi.id].sort())
    const ana = reminders.find((r) => r.personId === f.ana.id)!
    expect(ana.preview).toContain('Leitura (chegar 9h10)')
    expect(ana.preview).toContain('Café da manhã (chegar 8h45)')
    expect(ana.preview).toContain('domingo, 08/11 às 9h30')
    expect(ana.status).toBe('queued')
    // Sem consentimento: pendência, sem envio.
    expect(reminders.find((r) => r.personId === f.davi.id)!).toMatchObject({ status: 'blocked', blockedReason: 'no_consent' })

    // Reprocessar (mesmo instante ou minutos depois) não gera nada novo.
    await runDueReminders(db(), DUE)
    await runDueReminders(db(), new Date(DUE.getTime() + 30 * 60_000))
    expect(await db().select().from(outboundMessages).where(eq(outboundMessages.kind, 'weekly_reminder'))).toHaveLength(3)
    expect(await db().select().from(reminderRuns)).toHaveLength(1)
  })

  it('não dispara fora da tolerância nem antes da configuração', async () => {
    await setup()
    expect(await runDueReminders(db(), new Date(DUE.getTime() + 7 * 3600_000))).toHaveLength(0)
  })

  it('mudança após o lembrete gera correção só para os afetados, uma vez', async () => {
    const { f, church, s1, a2 } = await setup()
    await runDueReminders(db(), DUE)
    const now = new Date('2026-11-06T12:00:00Z')
    expect((await syncReminderCorrections(db(), church, now)).corrections).toBe(0)

    // Ana deixa o café; Carla entra no louvor.
    await removeAssignment(db(), f.coord.ctx, a2.id, { reason: 'ajuste' })
    await assignPerson(db(), f.coord.ctx, slotOf(s1, f.duties.louvor!), { personId: f.carla.id, notifyNow: false })
    await syncReminderCorrections(db(), church, now)
    const r2 = await syncReminderCorrections(db(), church, now)
    expect(r2.corrections).toBe(0)
    const corrections = await db().select().from(outboundMessages).where(eq(outboundMessages.kind, 'reminder_correction'))
    expect(corrections.map((c) => c.personId)).toEqual([f.ana.id])
    expect(corrections[0]!.preview).toContain('Leitura')
    expect(corrections[0]!.preview).not.toContain('Café')
    // Carla não tinha recebido lembrete nesta janela: recebe o lembrete normal.
    const carla = await db().select().from(outboundMessages).where(and(eq(outboundMessages.kind, 'weekly_reminder'), eq(outboundMessages.personId, f.carla.id)))
    expect(carla).toHaveLength(1)
    // Bruno e Davi não foram afetados.
    const others = await db().select().from(outboundMessages).where(eq(outboundMessages.kind, 'reminder_correction'))
    expect(others.some((m) => m.personId === f.bruno.id || m.personId === f.davi.id)).toBe(false)
  })

  it('troca após o lembrete corrige quem saiu e avisa quem entrou; recusa própria não gera correção', async () => {
    const { f, church, a1, a2 } = await setup()
    await runDueReminders(db(), DUE)
    await respondToAssignment(db(), f.ana.ctx, a2.id, { decision: 'declined' })
    await syncReminderCorrections(db(), church, new Date('2026-11-06T12:00:00Z'))
    expect(await db().select().from(outboundMessages).where(eq(outboundMessages.kind, 'reminder_correction'))).toHaveLength(0)

    const swap = await proposeSwap(db(), f.ana.ctx, a1.id, { candidatePersonId: f.carla.id })
    await respondToSwap(db(), f.carla.ctx, swap.id, true)
    await syncReminderCorrections(db(), church, new Date('2026-11-06T12:00:00Z'))
    const corrections = await db().select().from(outboundMessages).where(eq(outboundMessages.kind, 'reminder_correction'))
    expect(corrections.map((c) => c.personId)).toEqual([f.ana.id])
    expect(corrections[0]!.preview).toContain('nenhuma tarefa')
    const carla = await db().select().from(outboundMessages).where(and(eq(outboundMessages.kind, 'weekly_reminder'), eq(outboundMessages.personId, f.carla.id)))
    expect(carla).toHaveLength(1)
  })

  it('ciclo do trabalhador: lembrete na hora, envio simulado identificado e sem duplicação', async () => {
    const { f } = await setup()
    const first = await workerTick(db(), DUE)
    expect(first.reminderRuns).toBe(1)
    const again = await workerTick(db(), new Date(DUE.getTime() + 60_000))
    expect(again.reminderRuns).toBe(0)
    const ana = await db().query.outboundMessages.findFirst({ where: and(eq(outboundMessages.kind, 'weekly_reminder'), eq(outboundMessages.personId, f.ana.id)) })
    expect(ana).toMatchObject({ status: 'simulated', provider: 'simulation' })
    expect(ana!.providerMessageId).toMatch(/^sim-/)
  })
})
