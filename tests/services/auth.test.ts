import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { accounts, authTokens, outboundMessages, people } from '../../server/db/schema'
import { decryptSecret } from '../../server/lib/crypto'
import { acceptInvite, coordinatorResendAccess, createInvite, describeInvite, getSession, login, requestPasswordReset, resetPassword, verifyResetCode } from '../../server/services/auth'
import { createPerson } from '../../server/services/people'
import { makeChurch, useDb } from '../helpers'

function tokenFromMessage(enc: string | null) {
  const params = JSON.parse(decryptSecret(enc!)) as string[]
  return params[2]!.split('/').pop()!
}

describe('convites e acesso', () => {
  const db = useDb()

  it('convite individual cria a conta só da pessoa destinatária e é de uso único', async () => {
    const f = await makeChurch(db(), 'porto')
    const nova = await createPerson(db(), f.coord.ctx, { displayName: 'Elisa Nova', phone: '(51) 99888-7766', roles: ['participant'], restExempt: false, dutyIds: [] })
    const invite = await createInvite(db(), f.coord.ctx, nova.id)
    // Sem consentimento a mensagem fica bloqueada, visível à coordenação.
    expect(invite.messageStatus).toBe('blocked')
    expect(invite.blockedReason).toBe('no_consent')
    const msg = await db().query.outboundMessages.findFirst({ where: eq(outboundMessages.id, invite.messageId) })
    expect(msg!.preview).toContain('[link individual]')
    expect(JSON.stringify(msg!.params)).not.toContain('/convite/')
    const token = tokenFromMessage(msg!.secretParamsEnc)

    const info = await describeInvite(db(), token)
    expect(info).toMatchObject({ churchName: 'Igreja porto', firstName: 'Elisa', accountExists: false })
    expect(JSON.stringify(info)).not.toContain('Ana')

    await expect(acceptInvite(db(), { token, password: 'curta', client: 'web' })).rejects.toMatchObject({ code: 'weak_password' })
    const accepted = await acceptInvite(db(), { token, password: 'uma senha longa e boa', client: 'web' })
    expect(accepted.churchSlug).toBe('porto')
    const person = await db().query.people.findFirst({ where: eq(people.id, nova.id) })
    expect(person!.accountId).toBe(accepted.account.id)
    expect(accepted.account.login).toBe('+5551998887766')
    await expect(acceptInvite(db(), { token, password: 'uma senha longa e boa', client: 'web' })).rejects.toMatchObject({ status: 410 })
    const session = await getSession(db(), accepted.token)
    expect(session?.account.id).toBe(accepted.account.id)
  })

  it('convite expirado ou substituído não funciona', async () => {
    const f = await makeChurch(db(), 'porto')
    const nova = await createPerson(db(), f.coord.ctx, { displayName: 'Fábio', phone: '51 99777-1111', roles: ['participant'], restExempt: false, dutyIds: [] })
    const first = await createInvite(db(), f.coord.ctx, nova.id)
    const firstMsg = await db().query.outboundMessages.findFirst({ where: eq(outboundMessages.id, first.messageId) })
    const oldToken = tokenFromMessage(firstMsg!.secretParamsEnc)
    const second = await createInvite(db(), f.coord.ctx, nova.id)
    await expect(describeInvite(db(), oldToken)).rejects.toMatchObject({ status: 410 })
    const secondMsg = await db().query.outboundMessages.findFirst({ where: eq(outboundMessages.id, second.messageId) })
    const token = tokenFromMessage(secondMsg!.secretParamsEnc)
    await db().update(authTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(authTokens.id, second.inviteId))
    await expect(acceptInvite(db(), { token, password: 'uma senha longa e boa', client: 'web' })).rejects.toMatchObject({ status: 410 })
  })

  it('pessoa que já tem conta em outra igreja vincula com a senha existente', async () => {
    const porto = await makeChurch(db(), 'porto')
    const outra = await makeChurch(db(), 'outra')
    const same = await createPerson(db(), outra.coord.ctx, { displayName: 'Ana em outra', phone: porto.ana.phone, roles: ['participant'], restExempt: false, dutyIds: [] })
    const invite = await createInvite(db(), outra.coord.ctx, same.id)
    const msg = await db().query.outboundMessages.findFirst({ where: eq(outboundMessages.id, invite.messageId) })
    const token = tokenFromMessage(msg!.secretParamsEnc)
    expect((await describeInvite(db(), token)).accountExists).toBe(true)
    await expect(acceptInvite(db(), { token, password: 'senha errada qualquer', client: 'web' })).rejects.toMatchObject({ code: 'invalid_credentials' })
    const ok = await acceptInvite(db(), { token, password: 'senha-de-teste-123', client: 'web' })
    expect(ok.account.id).toBe(porto.ana.accountId)
  })

  it('login bloqueia após tentativas erradas e não revela se a conta existe', async () => {
    const f = await makeChurch(db(), 'porto')
    await expect(login(db(), { login: '+5500000000000', password: 'x', client: 'web' })).rejects.toMatchObject({ code: 'invalid_credentials' })
    for (let i = 0; i < 8; i++) {
      await expect(login(db(), { login: f.ana.phone!, password: 'errada', client: 'web' })).rejects.toMatchObject({ code: 'invalid_credentials' })
    }
    await expect(login(db(), { login: f.ana.phone!, password: 'senha-de-teste-123', client: 'web' })).rejects.toMatchObject({ code: 'account_locked' })
    await db().update(accounts).set({ lockedUntil: null }).where(eq(accounts.id, f.ana.accountId!))
    const ok = await login(db(), { login: f.ana.phone!.replace('+55', ''), password: 'senha-de-teste-123', client: 'native' })
    expect(ok.token).toBeTruthy()
  })

  it('nova senha por código no WhatsApp: tentativas limitadas, uso único, revoga sessões', async () => {
    const f = await makeChurch(db(), 'porto')
    const s = await login(db(), { login: f.ana.phone!, password: 'senha-de-teste-123', client: 'web' })
    await requestPasswordReset(db(), f.ana.phone!)
    const msg = await db().query.outboundMessages.findFirst({ where: and(eq(outboundMessages.churchId, f.church.id), eq(outboundMessages.kind, 'password_reset')) })
    expect(msg?.status).toBe('queued')
    expect(msg!.preview).not.toMatch(/\d{6}/) // o código nunca aparece no painel
    const code = (JSON.parse(decryptSecret(msg!.secretParamsEnc!)) as string[])[0]!
    expect(code).toMatch(/^\d{6}$/)
    const wrong = code === '000000' ? '111111' : '000000'
    await expect(verifyResetCode(db(), f.ana.phone!, wrong)).rejects.toMatchObject({ code: 'invalid_code' })
    const { token } = await verifyResetCode(db(), f.ana.phone!.replace('+55', ''), code)
    // O mesmo código não serve de novo.
    await expect(verifyResetCode(db(), f.ana.phone!, code)).rejects.toMatchObject({ code: 'invalid_code' })
    await resetPassword(db(), token, 'nova senha bem segura')
    expect(await getSession(db(), s.token)).toBeNull()
    await expect(resetPassword(db(), token, 'outra senha bem segura')).rejects.toMatchObject({ status: 410 })
    await expect(login(db(), { login: f.ana.phone!, password: 'nova senha bem segura', client: 'web' })).resolves.toBeTruthy()
    // Pedido para telefone inexistente não falha nem cria nada.
    await requestPasswordReset(db(), '+5511999999999')
  })

  it('código de senha: 5 erros revogam o código; a coordenação não troca senha de quem tem conta', async () => {
    const f = await makeChurch(db(), 'porto')
    await requestPasswordReset(db(), f.ana.phone!)
    const msg = await db().query.outboundMessages.findFirst({ where: and(eq(outboundMessages.churchId, f.church.id), eq(outboundMessages.kind, 'password_reset')) })
    const code = (JSON.parse(decryptSecret(msg!.secretParamsEnc!)) as string[])[0]!
    const wrong = code === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i++) await expect(verifyResetCode(db(), f.ana.phone!, wrong)).rejects.toMatchObject({ code: 'invalid_code' })
    await expect(verifyResetCode(db(), f.ana.phone!, code)).rejects.toMatchObject({ code: 'invalid_code' })
    await expect(coordinatorResendAccess(db(), f.coord.ctx, f.ana.id)).rejects.toMatchObject({ code: 'has_account' })
  })
})
