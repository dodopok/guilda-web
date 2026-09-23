import { expect, test } from '@playwright/test'
import { PASSWORD, PHONES } from './helpers'

test.describe('API v1: contrato e segurança', () => {
  test('saúde, 404 em JSON e cabeçalhos de segurança', async ({ request }) => {
    expect((await (await request.get('/api/v1/health')).json()).ok).toBe(true)
    const nf = await request.get('/api/v1/nao-existe')
    expect(nf.status()).toBe(404)
    expect((await nf.json()).error.code).toBe('not_found')
    const home = await request.get('/entrar')
    expect(home.headers()['x-frame-options']).toBe('DENY')
    expect(home.headers()['referrer-policy']).toBe('no-referrer')
    expect(home.headers()['content-security-policy']).toContain('frame-ancestors \'none\'')
  })

  test('app nativo usa token Bearer; sem sessão responde 401', async ({ request }) => {
    expect((await request.get('/api/v1/auth/me')).status()).toBe(401)
    const res = await request.post('/api/v1/auth/login', { data: { login: PHONES.alice, password: PASSWORD, client: 'native' } })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.session.token).toBeTruthy()
    const me = await request.get('/api/v1/auth/me', { headers: { Authorization: `Bearer ${body.session.token}` } })
    expect((await me.json()).memberships.map((m: { slug: string }) => m.slug)).toEqual(['porto'])
    const other = await request.get('/api/v1/churches/exemplo', { headers: { Authorization: `Bearer ${body.session.token}` } })
    expect(other.status()).toBe(404)
    const people = await request.get('/api/v1/churches/porto/people', { headers: { Authorization: `Bearer ${body.session.token}` } })
    expect(JSON.stringify(await people.json())).not.toContain('+55')
    const svc = await request.post('/api/v1/churches/porto/services', { headers: { Authorization: `Bearer ${body.session.token}` }, data: { date: '2030-01-06', time: '09:30', title: 'Invasão' } })
    expect(svc.status()).toBe(403)
  })

  test('escrita com cookie de outra origem é recusada (CSRF)', async ({ request }) => {
    await request.post('/api/v1/auth/login', { data: { login: PHONES.coord, password: PASSWORD } })
    const res = await request.post('/api/v1/churches/porto/songs', { data: { title: 'X' }, headers: { Origin: 'https://atacante.example' } })
    expect(res.status()).toBe(403)
    expect((await res.json()).error.code).toBe('csrf_rejected')
  })

  test('senha errada não revela a conta; webhook sem assinatura é recusado; convite inválido', async ({ request }) => {
    const a = await request.post('/api/v1/auth/login', { data: { login: PHONES.alice, password: 'errada' } })
    const b = await request.post('/api/v1/auth/login', { data: { login: '+5599999999999', password: 'errada' } })
    expect(a.status()).toBe(401)
    expect((await a.json()).error.message).toBe((await b.json()).error.message)
    const hook = await request.post('/api/v1/webhooks/whatsapp', { data: { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '1' } } }] }] }, headers: { 'X-Hub-Signature-256': 'sha256=00' } })
    expect(hook.status()).toBe(401)
    expect((await request.get('/api/v1/invites/token-invalido-com-tamanho-suficiente')).status()).toBe(410)
  })
})
