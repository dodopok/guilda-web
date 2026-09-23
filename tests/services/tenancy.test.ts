import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { assignments, slots } from '../../server/db/schema'
import { resolveChurchContext } from '../../server/services/context'
import { listPeople, updatePerson } from '../../server/services/people'
import { assignPerson, getScheduleEditor } from '../../server/services/schedule'
import { listServices } from '../../server/services/worship'
import { makeChurch, makeService, slotOf, useDb } from '../helpers'

describe('isolamento entre igrejas', () => {
  const db = useDb()

  it('conta de outra igreja não resolve contexto (404, sem revelar existência)', async () => {
    const porto = await makeChurch(db(), 'porto')
    const outra = await makeChurch(db(), 'outra')
    await expect(resolveChurchContext(db(), { accountId: outra.coord.accountId!, isPlatformAdmin: false }, 'porto'))
      .rejects.toMatchObject({ status: 404 })
    const ctx = await resolveChurchContext(db(), { accountId: porto.coord.accountId!, isPlatformAdmin: false }, 'porto')
    expect(ctx.church.id).toBe(porto.church.id)
  })

  it('administrador da plataforma não ganha acesso implícito a dados da igreja', async () => {
    await makeChurch(db(), 'porto')
    const outra = await makeChurch(db(), 'outra')
    await expect(resolveChurchContext(db(), { accountId: outra.coord.accountId!, isPlatformAdmin: true }, 'porto'))
      .rejects.toMatchObject({ status: 404 })
  })

  it('coordenação de outra igreja não lê nem altera pessoas, cultos ou escala de Porto', async () => {
    const porto = await makeChurch(db(), 'porto')
    const outra = await makeChurch(db(), 'outra')
    const svc = await makeService(db(), porto, '2026-11-08')
    const list = await listPeople(db(), outra.coord.ctx)
    expect(list.map((p) => p.id)).not.toContain(porto.ana.id)
    expect(await listServices(db(), outra.coord.ctx, '2026-11')).toHaveLength(0)
    await expect(updatePerson(db(), outra.coord.ctx, porto.ana.id, { displayName: 'Invasão' })).rejects.toMatchObject({ status: 404 })
    const portoSlots = await db().select().from(slots).where(eq(slots.serviceId, svc.id))
    await expect(assignPerson(db(), outra.coord.ctx, slotOf(portoSlots, porto.duties.abertura!), { personId: outra.ana.id, notifyNow: false }))
      .rejects.toMatchObject({ status: 404 })
    const editor = await getScheduleEditor(db(), outra.coord.ctx, '2026-11')
    expect(editor.services).toHaveLength(0)
  })

  it('o banco recusa designação que mistura igrejas (chave estrangeira composta)', async () => {
    const porto = await makeChurch(db(), 'porto')
    const outra = await makeChurch(db(), 'outra')
    const svc = await makeService(db(), porto, '2026-11-08')
    const portoSlots = await db().select().from(slots).where(eq(slots.serviceId, svc.id))
    await expect(db().insert(assignments).values({ churchId: porto.church.id, slotId: portoSlots[0]!.id, personId: outra.ana.id }))
      .rejects.toThrow()
    await expect(db().insert(assignments).values({ churchId: outra.church.id, slotId: portoSlots[0]!.id, personId: outra.ana.id }))
      .rejects.toThrow()
  })

  it('pessoa escalada de outra igreja é recusada pelo serviço', async () => {
    const porto = await makeChurch(db(), 'porto')
    const outra = await makeChurch(db(), 'outra')
    const svc = await makeService(db(), porto, '2026-11-08')
    const portoSlots = await db().select().from(slots).where(eq(slots.serviceId, svc.id))
    await expect(assignPerson(db(), porto.coord.ctx, slotOf(portoSlots, porto.duties.abertura!), { personId: outra.ana.id, notifyNow: false }))
      .rejects.toMatchObject({ code: 'invalid_person' })
  })
})
