import { type Browser, expect, test } from '@playwright/test'
import { PHONES, editor, login, nextMonth } from './helpers'

// Fluxos completos pela interface, na ordem real do trabalho da coordenação.
test.describe.configure({ mode: 'serial' })

async function as(browser: Browser, phone: string) {
  const context = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', viewport: { width: 1366, height: 900 } })
  const page = await context.newPage()
  await login(page, phone)
  return page
}

test('fluxo 2: pedido de indisponibilidade, resposta e painel respondeu × silêncio', async ({ browser }) => {
  const month = nextMonth()
  const coord = await as(browser, PHONES.coord)
  await coord.goto(`/i/porto/coordenacao/disponibilidade/${month}`)
  await coord.getByRole('button', { name: /Enviar agora/ }).first().click()
  await expect(coord.getByText(/Pedido enviado/).first()).toBeVisible()

  const alice = await as(browser, PHONES.alice)
  await expect(alice.getByText(/Quais cultos de .* você não pode servir\?/)).toBeVisible()
  await alice.getByRole('link', { name: 'Responder agora' }).first().click()
  await expect(alice).toHaveURL(new RegExp(`/disponibilidade/${month}`))
  await alice.getByRole('radio', { name: 'Não posso' }).first().check()
  await alice.getByRole('button', { name: /Enviar: não posso em 1/ }).click()
  await expect(alice.getByText(/Resposta enviada/)).toBeVisible()

  await coord.reload()
  await coord.getByRole('button', { name: 'Responderam', exact: true }).click()
  await expect(coord.getByText('Alice Fictícia', { exact: true })).toBeVisible()
  await expect(coord.getByText(/não pode em/).first()).toBeVisible()
  await coord.getByRole('button', { name: 'Sem resposta' }).click()
  await expect(coord.getByText('Bento Fictício', { exact: true })).toBeVisible()
  await coord.context().close()
  await alice.context().close()
})

test('fluxo 3: montar a escala com alertas, respeitar indisponibilidade e publicar com aviso', async ({ browser }) => {
  const month = nextMonth()
  const coord = await as(browser, PHONES.coord)
  const data = await editor(coord, month)
  const sundays = data.services.filter((s) => s.kind === 'regular')
  const leitura = data.duties.find((d) => d.name === 'Leitura')!
  const first = sundays[0]!.slots.find((s) => s.dutyId === leitura.id)!
  const second = sundays[1]!.slots.find((s) => s.dutyId === leitura.id)!

  // Alice marcou o primeiro culto como indisponível: aparece separada e exige justificativa.
  await coord.goto(`/i/porto/coordenacao/escalas/${month}?vaga=${first.id}`)
  const sheet = coord.getByRole('dialog')
  await expect(sheet.getByText('Informaram que não podem')).toBeVisible()
  await expect(sheet.getByRole('button', { name: /Alice Fictícia.*indisponível neste culto/ })).toBeVisible()
  await sheet.getByRole('button', { name: 'Pronto' }).click()

  await coord.goto(`/i/porto/coordenacao/escalas/${month}?vaga=${second.id}`)
  await coord.getByRole('dialog').getByRole('button', { name: /^Alice Fictícia/ }).click()
  await expect(coord.getByText(/Alice Fictícia escalado\(a\) em Leitura/)).toBeVisible()
  await coord.getByRole('dialog').getByRole('button', { name: /^Bento Fictício/ }).click()
  await expect(coord.getByText(/Bento Fictício escalado\(a\) em Leitura/)).toBeVisible()
  await expect(coord.getByRole('dialog').getByText('Vaga completa.', { exact: false })).toBeVisible()
  await coord.getByRole('dialog').getByRole('button', { name: 'Pronto' }).click()

  await expect(coord.getByRole('button', { name: /vagas abertas/ })).toBeVisible()
  await coord.getByRole('button', { name: 'Publicar escala' }).click()
  const pub = coord.getByRole('dialog')
  await pub.getByLabel(/Sim, avisar as/).check()
  await pub.getByRole('button', { name: 'Publicar', exact: true }).click()
  await expect(coord.getByText(/Escala publicada \(versão 1\)/)).toBeVisible()
  await coord.context().close()
})

test('fluxo 4: confirmar, pedir troca a habilitado e troca vale só no aceite', async ({ browser }) => {
  const month = nextMonth()
  const alice = await as(browser, PHONES.alice)
  await alice.goto('/i/porto/tarefas')
  const task = alice.locator('.task', { hasText: 'Leitura' }).first()
  await task.getByRole('button', { name: 'Confirmar' }).click()
  await expect(alice.getByText(/Confirmado: Leitura/)).toBeVisible()
  await expect(alice.locator('.task', { hasText: 'Leitura' }).first().getByText('Confirmada')).toBeVisible()

  const bento = await as(browser, PHONES.bento)
  const data = await editor(await as(browser, PHONES.coord), month)
  const leituraId = data.duties.find((d) => d.name === 'Leitura')!.id
  const slot = data.services.flatMap((s) => s.slots).find((s) => s.dutyId === leituraId && s.assignments.some((a) => a.personName === 'Bento Fictício'))!
  const assignmentId = slot.assignments.find((a) => a.personName === 'Bento Fictício')!.id
  await bento.goto(`/i/porto/tarefas/${assignmentId}`)
  await expect(bento.getByRole('heading', { name: 'Leitura' })).toBeVisible()
  await bento.getByLabel('Clara Fictícia').check()
  await bento.getByRole('button', { name: /Enviar pedido/ }).click()
  await expect(bento.getByText(/Pedido enviado para Clara Fictícia/)).toBeVisible()
  await expect(bento.getByText(/ainda não respondeu/)).toBeVisible()

  const clara = await as(browser, PHONES.clara)
  await expect(clara.getByText(/Alguém pediu que você assuma uma tarefa/)).toBeVisible()
  await clara.goto('/i/porto/trocas')
  await clara.getByRole('button', { name: /Aceitar/ }).click()
  await expect(clara.getByText(/agora é sua tarefa/)).toBeVisible()

  const coord = await as(browser, PHONES.coord)
  await coord.goto('/i/porto/coordenacao/pendencias')
  await expect(coord.getByText(/Clara Fictícia/).first()).toBeVisible()
  await expect(coord.getByText(/assumiu Leitura de Bento Fictício/)).toBeVisible()
  for (const p of [alice, bento, clara, coord]) await p.context().close()
})

test('fluxo 1: cadastrar pessoa, registrar consentimento, convite individual e criação de senha', async ({ browser }) => {
  const coord = await as(browser, PHONES.coord)
  await coord.goto('/i/porto/coordenacao/pessoas')
  await coord.getByRole('button', { name: /Nova pessoa/ }).click()
  const sheet = coord.getByRole('dialog')
  await sheet.getByLabel('Nome').fill('Irene Teste')
  await sheet.getByLabel('Celular (WhatsApp)').fill('(51) 90000-0999')
  await sheet.getByLabel('Holyrics').check()
  await sheet.getByRole('button', { name: 'Cadastrar' }).click()
  await expect(coord.getByText(/Irene Teste cadastrado/)).toBeVisible()

  await coord.getByRole('button', { name: 'Irene Teste' }).click()
  await coord.getByRole('dialog').getByRole('button', { name: 'Registrar autorização' }).click()
  await expect(coord.getByText('Consentimento registrado.')).toBeVisible()
  await coord.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click()

  const row = coord.getByRole('row', { name: /Irene Teste/ })
  await row.getByRole('button', { name: 'Convidar' }).click()
  await expect(coord.getByText(/Convite enviado para Irene Teste/)).toBeVisible()
  // O trabalhador processa a fila em ~1s; a mensagem é simulada e mostra o link.
  let body = ''
  for (let i = 0; i < 10 && !body.includes('/convite/'); i++) {
    await coord.waitForTimeout(1000)
    await row.getByRole('button', { name: 'Ver mensagem simulada' }).click()
    const dialog = coord.getByRole('dialog', { name: 'Mensagem simulada' })
    await dialog.waitFor({ state: 'visible', timeout: 2500 }).catch(() => undefined)
    if (await dialog.isVisible()) {
      body = (await dialog.textContent()) ?? ''
      await dialog.getByRole('button', { name: 'Fechar' }).click()
    }
  }
  const link = body.match(/https?:\/\/\S+\/convite\/[\w-]+/)?.[0]
  expect(link, 'link do convite na mensagem simulada').toBeTruthy()

  const ctx = await browser.newContext({ locale: 'pt-BR' })
  const irene = await ctx.newPage()
  await irene.goto(link!)
  await expect(irene.getByRole('heading', { name: 'Olá, Irene!' })).toBeVisible()
  await irene.getByLabel('Crie sua senha').fill('minha senha nova 123')
  await irene.getByLabel('Repita a senha').fill('minha senha nova 123')
  await irene.getByRole('button', { name: 'Criar senha e entrar' }).click()
  await expect(irene.getByText('Seu acesso está pronto')).toBeVisible()
  // O mesmo link não funciona de novo.
  const again = await ctx.newPage()
  await again.goto(link!)
  await expect(again.getByRole('heading', { name: 'Convite indisponível' })).toBeVisible()
  await ctx.close()
  await coord.context().close()
})

test('fluxos 6 e 7: roteiro a partir do modelo, Estêvão, publicação e leitura no celular', async ({ browser }) => {
  const month = nextMonth()
  const coord = await as(browser, PHONES.coord)
  const data = await editor(coord, month)
  const svc = data.services.filter((s) => s.kind === 'regular')[1]!
  await coord.goto(`/i/porto/coordenacao/roteiros/${svc.id}`)
  await coord.locator('li', { hasText: 'Domingo comum' }).getByRole('button', { name: 'Usar este modelo' }).click()
  await expect(coord.getByRole('button', { name: /Buscar sugestões no Estêvão/ })).toBeVisible()
  await coord.getByRole('button', { name: /Buscar sugestões no Estêvão/ }).click()
  await expect(coord.getByText(/Domingo de exemplo/).first()).toBeVisible()
  await coord.getByRole('button', { name: 'Aplicar ao roteiro' }).click()
  await expect(coord.getByText(/Aplicado ao roteiro/)).toBeVisible()
  await coord.getByRole('button', { name: /Publicar roteiro/ }).click()
  await expect(coord.getByText(/Roteiro publicado \(versão 1\)/)).toBeVisible()

  const ctx = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const reader = await ctx.newPage()
  await (await import('./helpers')).login(reader, PHONES.clara)
  await reader.goto(`/i/porto/roteiros/${svc.id}`)
  await expect(reader.getByRole('heading', { name: 'Evangelho' })).toBeVisible()
  await expect(reader.getByText(/^Mt \d+\.1-12$/)).toBeVisible()
  await expect(reader.getByText(/Dados litúrgicos do Estêvão/)).toBeVisible()
  const exp = await reader.request.get(`/api/v1/churches/porto/scripts/${svc.id}/export?format=txt`)
  expect(await exp.text()).toContain('EVANGELHO')
  await ctx.close()
  await coord.context().close()
})

test('isolamento: participante não abre outra igreja pela URL', async ({ browser }) => {
  const alice = await as(browser, PHONES.alice)
  await alice.goto('/i/exemplo')
  await expect(alice.getByRole('heading', { name: 'Sem acesso' })).toBeVisible()
  await alice.goto('/i/porto/coordenacao')
  await expect(alice).toHaveURL(/\/i\/porto$/)
  await alice.context().close()
})
