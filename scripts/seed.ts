// Dados FICTÍCIOS para desenvolvimento local. Nenhum nome, telefone ou texto real.
//   pnpm db:seed           -> cria as igrejas de exemplo (falha se já existirem)
// Senhas de exemplo servem só para uso local e são impressas no final.
import './load-env'
import { eq } from 'drizzle-orm'
import { closeDb, getDb } from '../server/db/client'
import { accounts, churches, consents, duties, ministries, people, qualifications, whatsappChannels } from '../server/db/schema'
import { hashPassword } from '../server/lib/crypto'
import { addDaysToLocalDate, localParts, weekdayOfLocalDate } from '../server/lib/time'
import { nameKey } from '../server/lib/text'
import type { ChurchContext, Role } from '../server/services/context'
import { scheduleRequest } from '../server/services/availability'
import { createScript, createSong, createTemplate, setMusic } from '../server/services/liturgy'
import { assignPerson, publishMonth } from '../server/services/schedule'
import { createService, createSundayServices, listServices } from '../server/services/worship'

const db = getDb()
const DEMO_PASSWORD = 'guilda-demo-123'
const ADMIN_LOGIN = 'admin@guilda.local'
const ADMIN_PASSWORD = 'guilda-admin-local'

if (process.env.NODE_ENV === 'production') {
  console.error('Seed de dados fictícios não roda em produção.')
  process.exit(1)
}
if (await db.query.churches.findFirst({ where: eq(churches.slug, 'porto') })) {
  console.error('Dados de exemplo já existem. Use "pnpm db:reset" para recriar o banco local.')
  process.exit(1)
}

const passwordHash = await hashPassword(DEMO_PASSWORD)
await db.insert(accounts).values({ login: ADMIN_LOGIN, passwordHash: await hashPassword(ADMIN_PASSWORD), displayName: 'Administração da plataforma', isPlatformAdmin: true })

const now = new Date()
const tz = 'America/Sao_Paulo'
const thisMonth = localParts(now, tz).month
const [yy, mm] = thisMonth.split('-').map(Number)
const nextMonth = mm === 12 ? `${yy! + 1}-01` : `${yy}-${String(mm! + 1).padStart(2, '0')}`

interface DutyDef { key: string, ministry: string, name: string, kind?: string, required?: number, arrival?: number | null, music?: boolean, instructions: string, byDefault?: boolean }

const MINISTRIES = ['Liturgia', 'Louvor', 'Mídia', 'Mídias Sociais', 'Café da Manhã', 'Sodalício', 'Serviço Dominical', 'Limpeza', 'Lojinha']
const DUTIES: DutyDef[] = [
  { key: 'abertura', ministry: 'Liturgia', name: 'Abertura', arrival: 20, instructions: 'Conduz a abertura e a coleta conforme o roteiro publicado.' },
  { key: 'confissao', ministry: 'Liturgia', name: 'Confissão', arrival: 20, instructions: 'Conduz a confissão conforme o roteiro.' },
  { key: 'leitura', ministry: 'Liturgia', name: 'Leitura', kind: 'reading', required: 2, arrival: 20, instructions: 'Lê a passagem indicada no roteiro. Confira a referência antes do culto.' },
  { key: 'ofertorio', ministry: 'Liturgia', name: 'Ofertório', arrival: 20, instructions: 'Conduz o momento do ofertório.' },
  { key: 'sermao', ministry: 'Liturgia', name: 'Sermão', kind: 'sermon', arrival: 30, instructions: 'Prega e, normalmente, escolhe as músicas do culto no app.' },
  { key: 'eucaristia', ministry: 'Liturgia', name: 'Eucaristia', kind: 'presiding', arrival: 30, instructions: 'Preside a eucaristia.' },
  { key: 'credo', ministry: 'Liturgia', name: 'Credo Apostólico', arrival: 20, instructions: 'Conduz o credo.' },
  { key: 'avisos', ministry: 'Liturgia', name: 'Avisos', arrival: 20, instructions: 'Lê os avisos organizados no roteiro.' },
  { key: 'bencao', ministry: 'Liturgia', name: 'Bênção / Envio', arrival: 20, instructions: 'Conduz a bênção e o envio.' },
  { key: 'louvor', ministry: 'Louvor', name: 'Louvor', kind: 'music', required: 3, arrival: 60, music: true, instructions: 'Ensaia e conduz as músicas escolhidas no app.' },
  { key: 'holyrics', ministry: 'Mídia', name: 'Holyrics', arrival: 30, instructions: 'Projeções na TV durante o culto.' },
  { key: 'redes', ministry: 'Mídias Sociais', name: 'Mídias Sociais', arrival: null, instructions: 'Fotos, vídeos e artes para as redes da igreja.' },
  { key: 'cafe', ministry: 'Café da Manhã', name: 'Café da Manhã', arrival: 45, instructions: 'Prepara café e chá, organiza a mesa, recolhe e lava ao final.' },
  { key: 'sodalicio', ministry: 'Sodalício', name: 'Sodalício', arrival: 30, instructions: 'Prepara a mesa da ceia, velas e panos.' },
  { key: 'servico', ministry: 'Serviço Dominical', name: 'Serviço Dominical', arrival: 45, instructions: 'Púlpito, água, apoio à ceia, salão e cadeiras.' },
  { key: 'limpeza', ministry: 'Limpeza', name: 'Limpeza', arrival: null, byDefault: false, instructions: 'Varrer o quintal, organizar cadeiras e ajudar na área do café. Horário de chegada a definir.' },
  { key: 'lojinha', ministry: 'Lojinha', name: 'Lojinha', arrival: null, instructions: 'Monta e guarda a lojinha após a ceia e registra as saídas.' },
]

// Nomes inventados; telefones no intervalo +55 51 90000-0xxx (fictícios).
const PEOPLE: { name: string, roles: Role[], duties: string[], account: boolean, consent: boolean, phone: boolean }[] = [
  { name: 'Coordenação Exemplo', roles: ['coordinator', 'participant'], duties: ['abertura', 'avisos', 'lojinha'], account: true, consent: true, phone: true },
  { name: 'Pastor Exemplo', roles: ['pastor', 'participant'], duties: ['sermao', 'eucaristia', 'bencao', 'abertura'], account: true, consent: true, phone: true },
  { name: 'Pastora Exemplo', roles: ['pastor', 'participant'], duties: ['sermao', 'eucaristia', 'bencao', 'confissao'], account: true, consent: true, phone: true },
  { name: 'Alice Fictícia', roles: ['participant'], duties: ['leitura', 'confissao', 'cafe', 'credo'], account: true, consent: true, phone: true },
  { name: 'Bento Fictício', roles: ['participant'], duties: ['leitura', 'holyrics', 'ofertorio'], account: true, consent: true, phone: true },
  { name: 'Clara Fictícia', roles: ['participant'], duties: ['louvor', 'leitura', 'avisos'], account: true, consent: true, phone: true },
  { name: 'Davi Fictício', roles: ['participant'], duties: ['louvor', 'servico', 'limpeza'], account: true, consent: false, phone: true },
  { name: 'Elisa Fictícia', roles: ['participant'], duties: ['louvor', 'redes', 'credo'], account: false, consent: true, phone: true },
  { name: 'Fábio Fictício', roles: ['participant'], duties: ['sodalicio', 'servico', 'ofertorio'], account: false, consent: false, phone: true },
  { name: 'Gabi Fictícia', roles: ['participant'], duties: ['cafe', 'lojinha', 'limpeza'], account: false, consent: false, phone: false },
  { name: 'Heitor Fictício', roles: ['participant'], duties: ['holyrics', 'redes', 'bencao'], account: true, consent: true, phone: true },
]

async function makeChurch(slug: string, name: string, peopleDefs: typeof PEOPLE, phoneBase: number) {
  const [church] = await db.insert(churches).values({
    slug, name, timezone: tz, defaultLocation: 'Salão principal', reminderEnabled: true, reminderWeekday: 4, reminderTime: '19:00', setupCompletedAt: new Date(),
  }).returning()
  await db.insert(whatsappChannels).values({ churchId: church!.id, mode: 'simulation' })
  const ministryId: Record<string, string> = {}
  for (const [i, m] of MINISTRIES.entries()) {
    const [row] = await db.insert(ministries).values({ churchId: church!.id, name: m, position: i }).returning()
    ministryId[m] = row!.id
  }
  const dutyId: Record<string, string> = {}
  for (const [i, d] of DUTIES.entries()) {
    const [row] = await db.insert(duties).values({
      churchId: church!.id, ministryId: ministryId[d.ministry]!, name: d.name, kind: d.kind ?? 'general', defaultRequiredCount: d.required ?? 1,
      arrivalMinutesBefore: d.arrival ?? null, receivesMusicNotice: d.music ?? false, instructions: d.instructions, position: i, includeByDefault: d.byDefault ?? true,
      inScript: (d.kind ?? 'general') !== 'general' || d.ministry === 'Liturgia',
    }).returning()
    dutyId[d.key] = row!.id
  }
  const ids: Record<string, { id: string, ctx: ChurchContext }> = {}
  for (const [i, p] of peopleDefs.entries()) {
    const phone = p.phone ? `+555190000${String(phoneBase + i).padStart(4, '0')}` : null
    let accountId: string | null = null
    if (p.account && phone) {
      const existing = await db.query.accounts.findFirst({ where: eq(accounts.login, phone) })
      accountId = existing?.id ?? (await db.insert(accounts).values({ login: phone, passwordHash, displayName: p.name }).returning())[0]!.id
    }
    const [row] = await db.insert(people).values({ churchId: church!.id, accountId, displayName: p.name, nameKey: nameKey(p.name), phoneE164: phone, roles: p.roles }).returning()
    if (p.duties.length) await db.insert(qualifications).values(p.duties.map((k) => ({ churchId: church!.id, personId: row!.id, dutyId: dutyId[k]! })))
    if (p.consent && phone) await db.insert(consents).values({ churchId: church!.id, personId: row!.id, status: 'granted', grantedAt: new Date(), source: 'presencial', evidenceNote: 'Dado fictício de exemplo' })
    ids[p.name] = { id: row!.id, ctx: { church: church!, accountId, personId: row!.id, roles: p.roles } }
  }
  return { church: church!, dutyId, ids }
}

const porto = await makeChurch('porto', 'Anglicana Porto (dados fictícios)', PEOPLE, 1)
const coord = porto.ids['Coordenação Exemplo']!.ctx

// Cultos: domingos 9h30 do mês atual e do próximo, e um culto especial numa quarta.
await createSundayServices(db, coord, { month: thisMonth, time: '09:30', title: 'Culto dominical', durationMinutes: 120 })
await createSundayServices(db, coord, { month: nextMonth, time: '09:30', title: 'Culto dominical', durationMinutes: 120 })
let special = `${nextMonth}-10`
while (weekdayOfLocalDate(special) !== 3) special = addDaysToLocalDate(special, 1)
await createService(db, coord, { date: special, time: '19:30', title: 'Culto especial de quarta-feira', durationMinutes: 90, kind: 'special', dutyIds: [porto.dutyId.abertura!, porto.dutyId.leitura!, porto.dutyId.sermao!, porto.dutyId.louvor!, porto.dutyId.holyrics!] })

// Escala do mês atual: preenchida parcialmente e publicada (deixa vagas e alertas reais).
const rota: Record<string, string[]> = {
  abertura: ['Coordenação Exemplo', 'Pastor Exemplo'],
  leitura: ['Alice Fictícia', 'Bento Fictício', 'Clara Fictícia'],
  sermao: ['Pastor Exemplo', 'Pastora Exemplo'],
  eucaristia: ['Pastora Exemplo', 'Pastor Exemplo'],
  louvor: ['Clara Fictícia', 'Davi Fictício', 'Elisa Fictícia'],
  holyrics: ['Bento Fictício', 'Heitor Fictício'],
  cafe: ['Alice Fictícia', 'Gabi Fictícia'],
  servico: ['Davi Fictício', 'Fábio Fictício'],
}
const current = await listServices(db, coord, thisMonth)
for (const [i, svc] of current.entries()) {
  for (const [key, names] of Object.entries(rota)) {
    const slot = svc.slots.find((s) => s.dutyId === porto.dutyId[key])
    if (!slot) continue
    const need = slot.requiredCount
    for (let n = 0; n < need; n++) {
      const name = names[(i + n) % names.length]!
      await assignPerson(db, coord, slot.id, { personId: porto.ids[name]!.id, notifyNow: false }).catch(() => undefined)
    }
  }
}
await publishMonth(db, coord, thisMonth, { notifyNow: false, justification: 'Escala de exemplo' })

// Coleta do próximo mês: agendada para daqui a 2 dias, prazo em 7 dias.
await scheduleRequest(db, coord, nextMonth, { sendAt: new Date(now.getTime() + 2 * 86400_000), deadlineAt: new Date(now.getTime() + 7 * 86400_000) })

// Modelos de liturgia. Textos do LOC NÃO são copiados: a coordenação cadastra.
const LOC = '[Cadastrar aqui o texto do LOC usado pela igreja. Verifique os direitos antes de compartilhar com outras comunidades.]'
const template = await createTemplate(db, coord, {
  name: 'Domingo comum',
  kind: 'regular',
  description: 'Estrutura recorrente: abertura, músicas, confissão, leituras, sermão, eucaristia, credo, avisos e envio.',
  blocks: [
    { type: 'rite', title: 'Abertura', body: LOC, textSource: 'loc_manual', dutyId: porto.dutyId.abertura },
    { type: 'collect', title: 'Coleta do dia', body: null, textSource: 'church', dutyId: porto.dutyId.abertura },
    { type: 'music', title: 'Músicas', textSource: 'church', dutyId: porto.dutyId.louvor },
    { type: 'rite', title: 'Confissão', body: LOC, textSource: 'loc_manual', dutyId: porto.dutyId.confissao },
    { type: 'rite', title: 'Absolvição', body: LOC, textSource: 'loc_manual', dutyId: porto.dutyId.eucaristia },
    { type: 'reading', title: 'Primeira leitura', textSource: 'church', dutyId: porto.dutyId.leitura },
    { type: 'psalm', title: 'Salmo', textSource: 'church', dutyId: porto.dutyId.leitura },
    { type: 'reading', title: 'Evangelho', textSource: 'church', dutyId: porto.dutyId.leitura },
    { type: 'rite', title: 'Ofertório', body: LOC, textSource: 'loc_manual', dutyId: porto.dutyId.ofertorio },
    { type: 'sermon', title: 'Sermão', textSource: 'church', dutyId: porto.dutyId.sermao },
    { type: 'rite', title: 'Eucaristia', body: LOC, textSource: 'loc_manual', dutyId: porto.dutyId.eucaristia },
    { type: 'rite', title: 'Credo Apostólico', body: LOC, textSource: 'loc_manual', dutyId: porto.dutyId.credo },
    { type: 'announcements', title: 'Avisos', textSource: 'church', dutyId: porto.dutyId.avisos },
    { type: 'rite', title: 'Bênção e envio', body: LOC, textSource: 'loc_manual', dutyId: porto.dutyId.bencao },
  ],
})
await createTemplate(db, coord, {
  name: 'Culto curto',
  kind: 'short',
  description: 'Liturgia intencionalmente curta, terminando nos avisos.',
  blocks: [
    { type: 'rite', title: 'Abertura', body: LOC, textSource: 'loc_manual', dutyId: porto.dutyId.abertura },
    { type: 'music', title: 'Músicas', textSource: 'church', dutyId: porto.dutyId.louvor },
    { type: 'reading', title: 'Leitura', textSource: 'church', dutyId: porto.dutyId.leitura },
    { type: 'sermon', title: 'Sermão', textSource: 'church', dutyId: porto.dutyId.sermao },
    { type: 'announcements', title: 'Avisos', textSource: 'church', dutyId: porto.dutyId.avisos },
  ],
})
const songA = await createSong(db, coord, { title: 'Cântico de exemplo A', author: 'Autor fictício', musicalKey: 'D' })
const songB = await createSong(db, coord, { title: 'Cântico de exemplo B', author: 'Autor fictício', musicalKey: 'G' })
await createSong(db, coord, { title: 'Cântico de exemplo C', musicalKey: 'C' })
const firstFuture = current.find((s) => s.startsAt > now) ?? current[current.length - 1]
if (firstFuture) {
  await createScript(db, coord, firstFuture.id, template.id)
  await setMusic(db, coord, firstFuture.id, { songIds: [songA.id, songB.id] })
}

// Segunda igreja fictícia, para demonstrar o isolamento.
const OTHER = PEOPLE.slice(0, 4).map((p, i) => ({ ...p, name: `${p.name.split(' ')[0]} da Comunidade ${i + 1}` }))
await makeChurch('exemplo', 'Comunidade Exemplo (dados fictícios)', OTHER, 101)

console.log(`
Dados fictícios criados.
  Igrejas: /i/porto e /i/exemplo  (WhatsApp em MODO DE SIMULAÇÃO: nada é enviado)
  Coordenação Porto:  telefone +5551900000001  senha ${DEMO_PASSWORD}
  Participante Porto: telefone +5551900000004  senha ${DEMO_PASSWORD}
  Pastor Porto:       telefone +5551900000002  senha ${DEMO_PASSWORD}
  Administração:      ${ADMIN_LOGIN}  senha ${ADMIN_PASSWORD}
  Pessoas sem conta (Elisa, Fábio, Gabi) recebem convite pela tela Pessoas.
`)
await closeDb()
