import { type Browser, expect, test } from '@playwright/test'
import pg from 'pg'
import { E2E_DB, e2eEnv } from './env'
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
  // O salmo também tem quem guia.
  await expect(coord.getByRole('group', { name: /^Quem lê Salmo/ }).getByRole('button', { name: /Clara Fictícia/ })).toBeVisible()
  // Avisar quem lê antes de salvar: salva o rascunho e avisa o bloco recém-criado.
  await coord.getByRole('button', { name: /^AF Alice Fictícia/ }).first().click()
  await coord.getByRole('button', { name: /Avisar Alice pelo WhatsApp/ }).click()
  await expect(coord.getByText(/Alice avisado\(a\) pelo WhatsApp/)).toBeVisible()
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

test('músicas: repertório e busca no Cifra Club, tom deste culto no aviso ao louvor', async ({ browser }) => {
  const month = nextMonth()
  const coord = await as(browser, PHONES.coord)
  const data = await editor(coord, month)
  const svc = data.services.filter((s) => s.kind === 'regular')[2]!
  await coord.goto(`/i/porto/roteiros/${svc.id}`)
  await coord.getByRole('button', { name: /^Músicas/ }).click()
  await coord.getByRole('searchbox', { name: 'Buscar música' }).fill('Santo')
  await expect(coord.getByText('No Cifra Club')).toBeVisible()
  await coord.getByRole('button', { name: /Santo \(exemplo\).*Adicionar/ }).click()
  await expect(coord.getByRole('link', { name: /Abrir cifra/ })).toHaveAttribute('href', 'https://www.cifraclub.com.br/artista-de-exemplo/cancao-de-exemplo/')
  // Tom original lido da página da cifra (simulada).
  await expect(coord.getByText(/tom original G \(lido da cifra\)/)).toBeVisible()
  await expect(coord.getByText('Artista de Exemplo · original G')).toBeVisible()
  await coord.getByRole('combobox', { name: 'Tom de Santo (exemplo) neste culto' }).fill('G')
  await coord.getByRole('combobox', { name: 'Tom de Santo (exemplo) neste culto' }).press('Tab')
  await coord.getByRole('button', { name: 'Salvar músicas e avisar o louvor' }).click()
  await expect(coord.getByText(/Músicas salvas/)).toBeVisible()
  const view = await (await coord.request.get(`/api/v1/churches/porto/scripts/${svc.id}`)).json() as { draft: { blocks: { type: string, data: { songIds?: string[], songKeys?: Record<string, string> } }[] } }
  const music = view.draft.blocks.find((b) => b.type === 'music')!
  expect(Object.values(music.data.songKeys ?? {})).toEqual(['G'])
  const songs = await (await coord.request.get('/api/v1/churches/porto/songs')).json() as { songs: { id: string, title: string, link: string | null }[] }
  expect(songs.songs.find((x) => x.id === music.data.songIds![0])).toMatchObject({ title: 'Santo (exemplo)', musicalKey: 'G', link: expect.stringContaining('cifraclub.com.br') })

  // Repertório: a mesma busca, adicionando direto.
  await coord.goto('/i/porto/coordenacao/repertorio')
  await coord.getByRole('searchbox', { name: 'Buscar música' }).fill('Glória')
  await coord.getByRole('button', { name: /Glória ao vivo \(exemplo\).*Adicionar ao repertório/ }).click()
  await expect(coord.getByText(/“Glória ao vivo \(exemplo\)” no repertório, tom original G/)).toBeVisible()
  await expect(coord.getByRole('button', { name: /Glória ao vivo \(exemplo\)/ })).toContainText('G')
  await coord.context().close()
})

test('modelo de liturgia: título fixo, nome do domingo, rito do LOC e leituras marcadas', async ({ browser }) => {
  const coord = await as(browser, PHONES.coord)
  await coord.goto('/i/porto/coordenacao/modelos')
  await coord.getByRole('button', { name: /Criar modelo/ }).click()
  await expect(coord).toHaveURL(/\/coordenacao\/modelos\/[0-9a-f-]{36}$/)
  const id = coord.url().split('/').pop()!
  await coord.getByLabel('Nome do modelo').fill('Modelo e2e')
  const addBlock = async (label: string) => {
    await coord.getByRole('button', { name: 'Acrescentar bloco' }).click()
    await coord.getByRole('button', { name: new RegExp(`^${label}`) }).click()
  }
  // Modelo vazio começa pelas funções da escala.
  await coord.getByRole('button', { name: 'Começar pelas funções da escala' }).click()
  await expect(coord.getByText('Funções da escala fora deste modelo.')).toHaveCount(0)
  await expect(coord.getByRole('button', { name: /^Tirar / })).not.toHaveCount(0)
  while (await coord.getByRole('button', { name: /^Tirar / }).count()) await coord.getByRole('button', { name: /^Tirar / }).first().click()
  await expect(coord.getByText('Funções da escala fora deste modelo.')).toHaveCount(0)
  await addBlock('Título')
  // Título é só texto: sem escolha de fonte.
  await expect(coord.getByText('É texto do Livro de Oração (LOC)')).toHaveCount(0)
  await coord.getByLabel('Título no roteiro').fill('Liturgia da Palavra')
  await addBlock('Nome do domingo')
  await expect(coord.getByText(/com o Próprio no Tempo Comum/)).toBeVisible()
  await addBlock('Rito')
  await coord.getByLabel('Título no roteiro').fill('Confissão')
  await coord.getByRole('textbox', { name: 'Texto', exact: true }).fill('Texto de exemplo')
  await coord.getByText('É texto do Livro de Oração (LOC)').click()
  await addBlock('Leituras do dia')
  await coord.getByRole('checkbox', { name: 'Segunda leitura' }).uncheck()
  await coord.getByRole('button', { name: 'Salvar modelo' }).click()
  await expect(coord.getByText(/Modelo salvo/)).toBeVisible()

  const res = await coord.request.get(`/api/v1/churches/porto/templates/${id}`)
  const { template } = await res.json() as { template: { blocks: { type: string, title: string, textSource: string }[] } }
  expect(template.blocks.map((b) => [b.type, b.title, b.textSource])).toEqual([
    ['heading', 'Liturgia da Palavra', 'church'],
    ['heading', 'Nome do domingo', 'estevao'],
    ['rite', 'Confissão', 'loc_manual'],
    ['reading', 'Primeira leitura', 'estevao'],
    ['psalm', 'Salmo', 'estevao'],
    ['reading', 'Evangelho', 'estevao'],
  ])

  // Roteiro já criado: refazer pelo modelo novo.
  const data = await editor(coord, nextMonth())
  const svc = data.services.filter((x) => x.kind === 'regular')[3]!
  await coord.goto(`/i/porto/roteiros/${svc.id}`)
  await expect(coord.getByText(/Feito com o modelo/)).toBeVisible()
  await coord.getByRole('button', { name: 'Refazer pelo modelo' }).click()
  await coord.getByRole('radio', { name: /Modelo e2e/ }).check()
  await coord.getByRole('button', { name: 'Refazer o roteiro' }).click()
  await expect(coord.getByText(/Roteiro refeito pelo modelo/)).toBeVisible()
  await expect(coord.getByText(/Feito com o modelo “Modelo e2e”/)).toBeVisible()
  await expect(coord.getByText('Liturgia da Palavra')).toBeVisible()
  await expect(coord.getByText(/Na escala, mas fora do roteiro:/)).toBeVisible()
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

test('nova igreja: convite da coordenação abre a configuração inicial', async ({ browser }) => {
  const admin = await (await browser.newContext({ locale: 'pt-BR' })).newPage()
  await login(admin, 'admin@guilda.local', 'guilda-admin-local')
  await admin.goto('/admin/igrejas')
  await admin.getByLabel('Nome da igreja').fill('Igreja Nova de Teste')
  await admin.getByLabel('Nome', { exact: true }).fill('Coordenação Nova')
  await admin.getByLabel('Celular (WhatsApp)').fill('(51) 90000-0777')
  await admin.getByRole('button', { name: /Criar igreja/ }).click()
  const link = (await admin.locator('code').first().textContent())!.trim()
  expect(link).toContain('/convite/')

  const coord = await (await browser.newContext({ locale: 'pt-BR' })).newPage()
  await coord.goto(link)
  await coord.getByLabel('Crie sua senha').fill('senha nova longa 123')
  await coord.getByLabel('Repita a senha').fill('senha nova longa 123')
  await coord.getByRole('button', { name: 'Criar senha' }).click()
  await coord.getByRole('button', { name: 'Continuar' }).click()
  await coord.getByRole('link', { name: 'Começar' }).click()
  // A tela troca de verdade (antes a URL mudava e a tela do convite ficava).
  await expect(coord).toHaveURL(/\/coordenacao\/comecar$/)
  await expect(coord.getByRole('heading', { name: /Boas-vindas à Guilda/ })).toBeVisible()
  await coord.getByRole('button', { name: /Vamos começar/ }).click()
  await expect(coord.getByText('Configuração inicial · passo 2 de 6')).toBeVisible()
  await admin.context().close()
  await coord.context().close()
})

test('logo: JPG enviado em Configurações é lido, guardado e sugere cores', async ({ browser }) => {
  const coord = await as(browser, PHONES.coord)
  await coord.goto('/i/porto/coordenacao/configuracoes')
  // Gera um JPG de verdade no próprio navegador (quadrado azul com faixa laranja).
  const b64 = await coord.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 400
    c.height = 300
    const g = c.getContext('2d')!
    g.fillStyle = '#1f6f8b'
    g.fillRect(0, 0, 400, 300)
    g.fillStyle = '#c2561c'
    g.fillRect(0, 200, 400, 100)
    return c.toDataURL('image/jpeg', 0.9).split(',')[1]!
  })
  await coord.locator('input[type=file]').setInputFiles({ name: 'logo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') })
  await expect(coord.getByText(/Cores encontradas no logo|Logo enviado/)).toBeVisible()
  await expect(coord.getByText('Não foi possível')).toHaveCount(0)
  const res = await coord.request.get('/api/v1/churches/porto/logo')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toMatch(/image\/(webp|png)/)
  await coord.context().close()
})

test('esqueci minha senha: código pelo WhatsApp, nova senha e entrada direta', async ({ browser }) => {
  const page = await (await browser.newContext({ locale: 'pt-BR' })).newPage()
  await page.goto('/recuperar-senha')
  await page.getByLabel('Seu celular').fill('51900000005')
  await page.getByRole('button', { name: 'Enviar código pelo WhatsApp' }).click()
  await expect(page.getByRole('heading', { name: 'Digite o código' })).toBeVisible()
  // Em simulação o código só existe cifrado no banco (e no log do servidor): nunca na tela.
  process.env.SECRETS_ENCRYPTION_KEY = e2eEnv().SECRETS_ENCRYPTION_KEY
  const { decryptSecret } = await import('../../server/lib/crypto')
  const pool = new pg.Pool({ connectionString: E2E_DB })
  let code = ''
  for (let i = 0; i < 20 && !code; i++) {
    const r = await pool.query(`select m.secret_params_enc from outbound_messages m join people p on p.id = m.person_id
      where m.kind = 'password_reset' and p.phone_e164 = '+5551900000005' order by m.created_at desc limit 1`)
    if (r.rows[0]?.secret_params_enc) code = (JSON.parse(decryptSecret(r.rows[0].secret_params_enc)) as string[])[0] ?? ''
    else await page.waitForTimeout(250)
  }
  await pool.end()
  expect(code).toMatch(/^\d{6}$/)
  await page.getByLabel('Código').fill(code === '000000' ? '111111' : '000000')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByText(/Código incorreto ou expirado/)).toBeVisible()
  await page.getByLabel('Código').fill(code)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByRole('heading', { name: 'Crie uma nova senha' })).toBeVisible()
  await page.getByLabel('Nova senha').fill('bento senha nova 2026')
  await page.getByLabel('Repita a senha').fill('bento senha nova 2026')
  await page.getByRole('button', { name: 'Salvar e entrar' }).click()
  await expect(page).toHaveURL(/\/i\/porto/)
  await page.context().close()
})

test('papéis: cadastrar pastor(a) que também coordena e filtrar', async ({ browser }) => {
  const coord = await as(browser, PHONES.coord)
  await coord.goto('/i/porto/coordenacao/pessoas')
  await coord.getByRole('button', { name: /Nova pessoa/ }).click()
  const form = coord.getByRole('dialog', { name: 'Nova pessoa' })
  await form.getByLabel('Nome').fill('Rev. Teste Pastor')
  await form.getByLabel('Celular (WhatsApp)').fill('(51) 90000-0888')
  await form.getByRole('button', { name: 'Pastor(a)' }).click()
  await form.getByRole('button', { name: 'Coordenação' }).click()
  await form.getByRole('button', { name: 'Cadastrar' }).click()
  await expect(coord.getByText(/Rev\. entrou na lista/)).toBeVisible()
  const sheet = coord.getByRole('dialog').filter({ hasText: 'Rev. Teste Pastor' })
  await expect(sheet.getByRole('button', { name: 'Pastor(a)' })).toHaveAttribute('aria-pressed', 'true')
  await expect(sheet.getByRole('button', { name: 'Coordenação' })).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('button', { name: 'Fechar' }).click()
  await coord.getByRole('button', { name: /^Pastores/ }).click()
  const row = coord.getByRole('button', { name: /Rev\. Teste Pastor/ })
  await expect(row).toBeVisible()
  await expect(row).toContainText('Coordenação · Pastor(a)')
  await coord.context().close()
})
