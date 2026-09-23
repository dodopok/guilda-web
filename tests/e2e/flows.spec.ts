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
  await coord.goto(`/i/porto/coordenacao/preparar/${month}?passo=2`)
  await coord.getByRole('button', { name: /Enviar agora/ }).first().click()
  await expect(coord.getByText(/Pedido enviado para/).first()).toBeVisible()

  const alice = await as(browser, PHONES.alice)
  await alice.getByRole('link', { name: /Em quais cultos de .* você não pode\?/ }).click()
  await expect(alice).toHaveURL(new RegExp(`/disponibilidade/${month}`))
  await alice.getByRole('button', { name: 'Não posso', exact: true }).first().click()
  await alice.getByRole('button', { name: /Enviar: não posso em 1/ }).click()
  await expect(alice.getByText(/Resposta enviada/)).toBeVisible()

  await coord.reload()
  await expect(coord.getByText(/Ainda em silêncio/)).toBeVisible()
  await expect(coord.getByText('Bento Fictício', { exact: true })).toBeVisible()
  await coord.getByText(/Quem já respondeu/).click()
  await expect(coord.getByText('Alice Fictícia', { exact: true })).toBeVisible()
  await expect(coord.getByRole('button', { name: /Não pode:/ }).first()).toBeVisible()
  await coord.context().close()
  await alice.context().close()
})

test('fluxo 3: montar a escala, respeitar indisponibilidade com exceção e publicar com aviso', async ({ browser }) => {
  const month = nextMonth()
  const coord = await as(browser, PHONES.coord)
  const data = await editor(coord, month)
  const sundays = data.services.filter((s) => s.kind === 'regular')

  // Alice marcou o primeiro culto como indisponível: fica à parte e exige motivo.
  await coord.goto(`/i/porto/coordenacao/preparar/${month}?passo=3&culto=${sundays[0]!.id}`)
  await coord.getByRole('button', { name: /^\d?\s*Leitura/ }).first().click()
  await coord.getByRole('button', { name: /Ver todas as pessoas/ }).click()
  const all = coord.getByRole('dialog')
  await expect(all.getByText('Avisaram que não podem')).toBeVisible()
  await all.getByRole('button', { name: /Alice Fictícia.*Não pode neste culto/ }).click()
  const exc = coord.getByRole('dialog', { name: /Escalar Alice mesmo assim\?/ })
  await expect(exc).toBeVisible()
  await exc.getByRole('button', { name: 'Escalar com este motivo' }).click()
  await expect(exc.getByText('Escreva o motivo para continuar.')).toBeVisible()
  await exc.getByRole('button', { name: 'Voltar' }).click()

  await coord.goto(`/i/porto/coordenacao/preparar/${month}?passo=3&culto=${sundays[1]!.id}`)
  await coord.getByRole('button', { name: /^\d?\s*Leitura/ }).first().click()
  await coord.getByRole('button', { name: /^AF Alice Fictícia/ }).click()
  await expect(coord.getByText(/Pronto: Alice em Leitura/)).toBeVisible()
  await coord.getByRole('button', { name: /^BF Bento Fictício/ }).click()
  await expect(coord.getByText(/Pronto: Bento em Leitura/)).toBeVisible()

  await coord.goto(`/i/porto/coordenacao/preparar/${month}?passo=4`)
  await coord.getByRole('radio', { name: /Sim, avisar as/ }).click()
  await coord.getByRole('button', { name: /Publicar a escala de/ }).click()
  await expect(coord.getByText(/publicada!/)).toBeVisible()
  await coord.context().close()
})

test('fluxo 4: confirmar, pedir para alguém assumir e troca vale só no aceite', async ({ browser }) => {
  const month = nextMonth()
  const alice = await as(browser, PHONES.alice)
  await alice.goto('/i/porto/tarefas')
  await alice.getByRole('link', { name: /Leitura/ }).first().click()
  await alice.getByRole('button', { name: 'Confirmar' }).click()
  await expect(alice.getByText(/Você confirmou\. Obrigado por servir!/)).toBeVisible()

  const coordPage = await as(browser, PHONES.coord)
  const data = await editor(coordPage, month)
  await coordPage.context().close()
  const leituraId = data.duties.find((d) => d.name === 'Leitura')!.id
  const slot = data.services.flatMap((s) => s.slots).find((s) => s.dutyId === leituraId && s.assignments.some((a) => a.personName === 'Bento Fictício'))!
  const assignmentId = slot.assignments.find((a) => a.personName === 'Bento Fictício')!.id

  const bento = await as(browser, PHONES.bento)
  await bento.goto(`/i/porto/tarefas/${assignmentId}`)
  await expect(bento.getByRole('heading', { name: 'Leitura', level: 1 })).toBeVisible()
  await bento.getByRole('button', { name: /Pedir para alguém assumir/ }).click()
  const sheet = bento.getByRole('dialog', { name: 'Quem pode assumir?' })
  await sheet.getByRole('radio', { name: /Clara Fictícia/ }).click()
  await sheet.getByRole('button', { name: 'Pedir a Clara Fictícia' }).click()
  await expect(bento.getByText(/Pedido enviado para Clara Fictícia/)).toBeVisible()
  await expect(bento.getByText(/aguardando resposta/)).toBeVisible()

  const clara = await as(browser, PHONES.clara)
  await clara.goto('/i/porto/trocas')
  await expect(clara.getByText(/pede para você assumir/).first()).toBeVisible()
  await clara.getByRole('button', { name: 'Assumo' }).first().click()
  await expect(clara.getByText(/Você assumiu\./)).toBeVisible()

  const coord = await as(browser, PHONES.coord)
  await coord.goto('/i/porto/coordenacao/historico?tipo=escala')
  await expect(coord.getByText(/assumiu uma tarefa/).first()).toBeVisible()
  for (const p of [alice, bento, clara, coord]) await p.context().close()
})

test('fluxo 1: cadastrar pessoa, registrar consentimento, convite individual e criação de senha', async ({ browser }) => {
  const coord = await as(browser, PHONES.coord)
  await coord.goto('/i/porto/coordenacao/pessoas')
  await coord.getByRole('button', { name: /Nova pessoa/ }).click()
  const form = coord.getByRole('dialog', { name: 'Nova pessoa' })
  await form.getByLabel('Nome').fill('Irene Teste')
  await form.getByLabel('Celular (WhatsApp)').fill('(51) 90000-0999')
  await form.getByRole('button', { name: 'Cadastrar' }).click()
  await expect(coord.getByText(/Irene entrou na lista/)).toBeVisible()

  // A folha da pessoa abre em seguida: funções, autorização e convite.
  const sheet = coord.getByRole('dialog').filter({ hasText: 'Irene Teste' })
  await sheet.getByRole('button', { name: 'Holyrics' }).click()
  await sheet.getByRole('switch', { name: /Autorizou receber WhatsApp/ }).click()
  await expect(coord.getByText('Autorização registrada.')).toBeVisible()
  await sheet.getByRole('button', { name: /Enviar convite pelo WhatsApp/ }).click()
  await expect(coord.getByText(/Convite enviado para Irene/)).toBeVisible()
  // O trabalhador processa a fila em ~1s; a mensagem é simulada e mostra o link.
  let body = ''
  for (let i = 0; i < 10 && !body.includes('/convite/'); i++) {
    await coord.waitForTimeout(1000)
    await sheet.getByRole('button', { name: 'Ver mensagem simulada' }).click()
    body = (await sheet.locator('.bubble').textContent().catch(() => '')) ?? ''
  }
  const link = body.match(/https?:\/\/\S+\/convite\/[\w-]+/)?.[0]
  expect(link, 'link do convite na mensagem simulada').toBeTruthy()
  await sheet.getByRole('button', { name: 'Salvar' }).click()
  await expect(coord.getByText('Alterações salvas.')).toBeVisible()

  const ctx = await browser.newContext({ locale: 'pt-BR' })
  const irene = await ctx.newPage()
  await irene.goto(link!)
  await expect(irene.getByRole('heading', { name: 'Oi, Irene!' })).toBeVisible()
  await irene.getByLabel('Crie sua senha').fill('minha senha nova 123')
  await irene.getByLabel('Repita a senha').fill('minha senha nova 123')
  await irene.getByRole('button', { name: 'Criar senha' }).click()
  await expect(irene.getByRole('heading', { name: /Quer receber lembretes pelo WhatsApp\?/ })).toBeVisible()
  await irene.getByRole('button', { name: 'Continuar' }).click()
  await expect(irene.getByRole('heading', { name: 'É simples assim' })).toBeVisible()
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
  await coord.goto(`/i/porto/roteiros/${svc.id}`)
  await coord.getByRole('button', { name: /^Leituras/ }).click()
  await coord.getByRole('button', { name: /leituras do (dia no )?Estêvão/ }).click()
  await expect(coord.getByText(/Leituras do Estêvão no roteiro/)).toBeVisible()
  await coord.getByRole('button', { name: 'Publicar', exact: true }).click()
  await expect(coord.getByText(/Roteiro publicado \(versão 1\)/)).toBeVisible()

  const ctx = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const reader = await ctx.newPage()
  await login(reader, PHONES.clara)
  await reader.goto(`/i/porto/roteiros/${svc.id}`)
  await expect(reader.getByRole('heading', { name: 'Evangelho' })).toBeVisible()
  await expect(reader.getByText(/Mt \d+\.1-12/).first()).toBeVisible()
  const exp = await reader.request.get(`/api/v1/churches/porto/scripts/${svc.id}/export?format=txt`)
  expect(await exp.text()).toContain('EVANGELHO')
  await ctx.close()
  await coord.context().close()
})

test('telas complementares da coordenação abrem pelas Configurações', async ({ browser }) => {
  const coord = await as(browser, PHONES.coord)
  await coord.goto('/i/porto/coordenacao/configuracoes')
  for (const [label, heading] of [
    ['Mensagens enviadas', 'Mensagens enviadas'],
    ['Canal do WhatsApp', 'Canal do WhatsApp'],
    ['Modelos de liturgia', 'Modelos de liturgia'],
    ['Repertório', 'Repertório'],
    ['Importar planilha', 'Importar a planilha antiga'],
    ['Histórico', 'Histórico'],
  ] as const) {
    await coord.getByRole('link', { name: new RegExp(`^${label}`) }).click()
    await expect(coord.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
    await coord.getByRole('link', { name: 'Configurações' }).first().click()
  }
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
