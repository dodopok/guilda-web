import { describe, expect, it } from 'vitest'
import { createPerson, updatePerson } from '../../server/services/people'
import { makeChurch, useDb } from '../helpers'

describe('papéis na igreja', () => {
  const db = useDb()

  it('mesma pessoa coordena e é pastor(a); mais de uma coordenação; nunca fica sem coordenação', async () => {
    const f = await makeChurch(db(), 'porto')
    // A coordenação também é pastor(a) (igreja pequena).
    const me = await updatePerson(db(), f.coord.ctx, f.coord.id, { roles: ['participant', 'coordinator', 'pastor'] })
    expect(me.roles.sort()).toEqual(['coordinator', 'participant', 'pastor'])
    // Sozinha na coordenação, não pode deixar a igreja sem ninguém coordenando.
    await expect(updatePerson(db(), f.coord.ctx, f.coord.id, { roles: ['participant', 'pastor'] })).rejects.toMatchObject({ code: 'last_coordinator' })
    // Com uma segunda pessoa na coordenação, pode.
    const second = await createPerson(db(), f.coord.ctx, { displayName: 'Segunda Coordenação', phone: '(51) 90000-0555', roles: ['participant', 'coordinator'], restExempt: false, dutyIds: [] })
    expect(second.roles).toContain('coordinator')
    const after = await updatePerson(db(), f.coord.ctx, f.coord.id, { roles: ['participant', 'pastor'] })
    expect(after.roles).not.toContain('coordinator')
  })
})
