// Registro das rotas da API v1 para gerar o OpenAPI (docs/openapi.json).
// Os corpos usam os mesmos esquemas Zod validados pelas rotas.
// Um teste confere que toda rota em server/api/v1 está listada aqui.
import { z } from 'zod'
import { availabilityRequestSchemaDoc } from './services/doc-schemas'
import { consentSchema, personInputSchema, personUpdateSchema } from './services/people'
import { dutySchema, ministrySchema } from './services/catalog'
import { createChurchSchema, updateChurchSchema } from './services/churches'
import { serviceInputSchema, serviceUpdateSchema, slotInputSchema } from './services/worship'
import { assignSchema, publishSchema, reassignSchema } from './services/schedule'
import { proposeSwapSchema, respondSchema } from './services/responses'
import { submitSchema } from './services/availability'
import { applySchema, blocksSchema, musicSchema, scriptUpdateSchema, songSchema, templateSchema } from './services/liturgy'
import { channelUpdateSchema, coexistenceSchema } from './services/messaging/admin'
import { importInputSchema } from './services/import'

export interface RouteDoc {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete'
  path: string
  summary: string
  auth: 'none' | 'session' | 'coordinator' | 'platform_admin' | 'signature'
  body?: z.ZodType
  query?: Record<string, string>
}

const C = '/api/v1/churches/{church}'
const month = { month: 'Mês no formato AAAA-MM' }

export const ROUTES: RouteDoc[] = [
  { method: 'get', path: '/api/v1/health', summary: 'Verifica se a API e o banco respondem', auth: 'none' },
  // Autenticação
  { method: 'post', path: '/api/v1/auth/login', summary: 'Entrar. client=web grava cookie httpOnly; client=native devolve token Bearer', auth: 'none', body: z.object({ login: z.string(), password: z.string(), client: z.enum(['web', 'native']).optional() }) },
  { method: 'post', path: '/api/v1/auth/logout', summary: 'Encerrar a sessão atual', auth: 'session' },
  { method: 'get', path: '/api/v1/auth/me', summary: 'Conta atual e igrejas às quais tem acesso', auth: 'session' },
  { method: 'post', path: '/api/v1/auth/password', summary: 'Trocar a senha (encerra as outras sessões)', auth: 'session', body: z.object({ current: z.string(), next: z.string() }) },
  { method: 'delete', path: '/api/v1/auth/sessions', summary: 'Encerrar sessões em outros aparelhos', auth: 'session' },
  { method: 'post', path: '/api/v1/password-reset/request', summary: 'Pedir link de nova senha pelo WhatsApp (resposta sempre igual)', auth: 'none', body: z.object({ login: z.string() }) },
  { method: 'post', path: '/api/v1/password-reset/confirm', summary: 'Definir nova senha com o link recebido', auth: 'none', body: z.object({ token: z.string(), password: z.string() }) },
  { method: 'get', path: '/api/v1/invites/{token}', summary: 'Dados mínimos do convite (igreja e primeiro nome)', auth: 'none' },
  { method: 'post', path: '/api/v1/invites/{token}/accept', summary: 'Aceitar convite: cria a conta (ou vincula com a senha existente) e inicia sessão', auth: 'none', body: z.object({ password: z.string(), client: z.enum(['web', 'native']).optional() }) },
  // Igrejas
  { method: 'post', path: '/api/v1/churches', summary: 'Cadastrar igreja e primeira pessoa da coordenação (devolve o link do primeiro convite uma única vez)', auth: 'platform_admin', body: createChurchSchema },
  { method: 'get', path: C, summary: 'Igreja, papéis da pessoa, cor litúrgica corrente', auth: 'session' },
  { method: 'patch', path: C, summary: 'Configurações da igreja e do lembrete semanal', auth: 'coordinator', body: updateChurchSchema },
  { method: 'get', path: `${C}/overview`, summary: 'Painel inicial da coordenação', auth: 'coordinator' },
  { method: 'get', path: `${C}/pending`, summary: 'Pendências: recusas, sem resposta, trocas, mensagens com problema', auth: 'coordinator' },
  { method: 'get', path: `${C}/audit`, summary: 'Histórico de ações', auth: 'coordinator', query: { limit: 'Quantidade (1–200)', entityId: 'Filtrar por registro' } },
  // Pessoas
  { method: 'get', path: `${C}/people`, summary: 'Pessoas. Coordenação vê contatos; demais membros só nomes e funções', auth: 'session' },
  { method: 'post', path: `${C}/people`, summary: 'Cadastrar pessoa', auth: 'coordinator', body: personInputSchema },
  { method: 'patch', path: `${C}/people/{id}`, summary: 'Alterar pessoa (trocar telefone revoga consentimento e convites)', auth: 'coordinator', body: personUpdateSchema },
  { method: 'put', path: `${C}/people/{id}/qualifications`, summary: 'Definir funções que a pessoa pode assumir', auth: 'coordinator', body: z.object({ dutyIds: z.array(z.string()) }) },
  { method: 'put', path: `${C}/people/{id}/consent`, summary: 'Registrar consentimento ou revogação para WhatsApp', auth: 'coordinator', body: consentSchema },
  { method: 'post', path: `${C}/people/{id}/invite`, summary: 'Enviar convite individual (ou link de nova senha a quem já tem conta)', auth: 'coordinator' },
  { method: 'get', path: `${C}/people/{id}/availability/{month}`, summary: 'Indisponibilidades de uma pessoa no mês', auth: 'coordinator' },
  { method: 'put', path: `${C}/people/{id}/availability/{month}`, summary: 'Registrar resposta recebida por outro canal', auth: 'coordinator', body: submitSchema },
  { method: 'get', path: `${C}/me`, summary: 'Perfil da pessoa na igreja', auth: 'session' },
  { method: 'get', path: `${C}/me/home`, summary: 'Início: próximas tarefas, pedidos de troca e de indisponibilidade', auth: 'session' },
  { method: 'get', path: `${C}/me/tasks`, summary: 'Minhas tarefas em escalas publicadas', auth: 'session' },
  { method: 'get', path: `${C}/me/swaps`, summary: 'Pedidos de troca enviados e recebidos', auth: 'session' },
  { method: 'put', path: `${C}/me/consent`, summary: 'A própria pessoa autoriza ou revoga mensagens', auth: 'session', body: z.object({ status: z.enum(['granted', 'revoked']) }) },
  { method: 'get', path: `${C}/me/availability/{month}`, summary: 'Cultos do mês e minhas indisponibilidades', auth: 'session' },
  { method: 'put', path: `${C}/me/availability/{month}`, summary: 'Enviar minhas indisponibilidades (lista vazia = pode em todos)', auth: 'session', body: submitSchema },
  // Importação da planilha
  { method: 'post', path: `${C}/import/preview`, summary: 'Prévia da importação de um mês da planilha (CSV com DATA, MINISTÉRIO, VOLUNTÁRIO)', auth: 'coordinator', body: importInputSchema },
  { method: 'post', path: `${C}/import/apply`, summary: 'Aplicar importação revisada (idempotente; não cria pessoas)', auth: 'coordinator', body: importInputSchema },
  // Catálogo
  { method: 'get', path: `${C}/catalog`, summary: 'Ministérios e funções', auth: 'session' },
  { method: 'post', path: `${C}/ministries`, summary: 'Criar ministério', auth: 'coordinator', body: ministrySchema },
  { method: 'patch', path: `${C}/ministries/{id}`, summary: 'Alterar ministério', auth: 'coordinator', body: ministrySchema.partial() },
  { method: 'post', path: `${C}/duties`, summary: 'Criar função', auth: 'coordinator', body: dutySchema },
  { method: 'patch', path: `${C}/duties/{id}`, summary: 'Alterar função', auth: 'coordinator', body: dutySchema.partial() },
  { method: 'delete', path: `${C}/duties/{id}`, summary: 'Remover função (desativa se já usada)', auth: 'coordinator' },
  // Cultos
  { method: 'get', path: `${C}/services`, summary: 'Cultos do mês com postos', auth: 'session', query: month },
  { method: 'post', path: `${C}/services`, summary: 'Cadastrar culto com postos', auth: 'coordinator', body: serviceInputSchema },
  { method: 'post', path: `${C}/services/sundays`, summary: 'Criar os cultos de todos os domingos do mês (idempotente)', auth: 'coordinator', body: z.object({ month: z.string(), time: z.string().optional(), title: z.string().optional(), durationMinutes: z.number().optional() }) },
  { method: 'patch', path: `${C}/services/{id}`, summary: 'Alterar ou cancelar culto (em mês publicado, gera nova versão)', auth: 'coordinator', body: serviceUpdateSchema },
  { method: 'delete', path: `${C}/services/{id}`, summary: 'Apagar culto sem designações', auth: 'coordinator' },
  { method: 'post', path: `${C}/services/{id}/slots`, summary: 'Adicionar posto', auth: 'coordinator', body: slotInputSchema },
  { method: 'patch', path: `${C}/slots/{id}`, summary: 'Alterar posto (quantidade, chegada)', auth: 'coordinator', body: slotInputSchema.partial() },
  { method: 'delete', path: `${C}/slots/{id}`, summary: 'Remover posto vazio', auth: 'coordinator' },
  { method: 'post', path: `${C}/slots/{id}/assignments`, summary: 'Escalar pessoa (excepcional ou indisponível exigem justificativa)', auth: 'coordinator', body: assignSchema },
  // Escala
  { method: 'get', path: `${C}/schedule/{month}`, summary: 'Editor da escala: grade, alertas e carga por pessoa', auth: 'coordinator' },
  { method: 'get', path: `${C}/schedule/{month}/published`, summary: 'Escala publicada do mês', auth: 'session' },
  { method: 'get', path: `${C}/schedule/{month}/history`, summary: 'Versões publicadas e alterações', auth: 'coordinator' },
  { method: 'post', path: `${C}/schedule/{month}/publish`, summary: 'Publicar (nova versão), escolhendo se avisa agora', auth: 'coordinator', body: publishSchema },
  { method: 'delete', path: `${C}/assignments/{id}`, summary: 'Retirar pessoa da escala', auth: 'coordinator', body: z.object({ reason: z.string().optional(), notifyNow: z.boolean().optional() }) },
  { method: 'post', path: `${C}/assignments/{id}/reassign`, summary: 'Designação excepcional: trocar a pessoa com motivo registrado', auth: 'coordinator', body: reassignSchema },
  { method: 'post', path: `${C}/assignments/{id}/respond`, summary: 'Confirmar ou recusar tarefa (rowVersion evita resposta sobre tarefa alterada)', auth: 'session', body: respondSchema },
  { method: 'get', path: `${C}/assignments/{id}/candidates`, summary: 'Substitutos habilitados para a mesma função e sua situação', auth: 'session' },
  { method: 'get', path: `${C}/assignments/{id}/history`, summary: 'Histórico de respostas da tarefa', auth: 'session' },
  { method: 'post', path: `${C}/assignments/{id}/swaps`, summary: 'Pedir a um habilitado que assuma a tarefa', auth: 'session', body: proposeSwapSchema },
  { method: 'post', path: `${C}/swaps/{id}/accept`, summary: 'Aceitar troca: efetiva na hora, sem aprovação', auth: 'session' },
  { method: 'post', path: `${C}/swaps/{id}/reject`, summary: 'Recusar troca', auth: 'session' },
  { method: 'post', path: `${C}/swaps/{id}/cancel`, summary: 'Cancelar pedido de troca feito por mim', auth: 'session' },
  // Indisponibilidade
  { method: 'get', path: `${C}/availability/{month}`, summary: 'Painel: quem respondeu, quem está em silêncio, indisponíveis por culto', auth: 'coordinator' },
  { method: 'put', path: `${C}/availability/{month}/request`, summary: 'Agendar (ou antecipar) o pedido do mês', auth: 'coordinator', body: availabilityRequestSchemaDoc },
  { method: 'post', path: `${C}/availability/{month}/send-now`, summary: 'Enviar o pedido agora (idempotente por pessoa)', auth: 'coordinator' },
  { method: 'post', path: `${C}/availability/{month}/cancel`, summary: 'Cancelar pedido ainda não enviado', auth: 'coordinator' },
  { method: 'post', path: `${C}/availability/{month}/notify-new`, summary: 'Avisar sobre cultos criados depois do pedido', auth: 'coordinator' },
  // Mensagens
  { method: 'get', path: `${C}/messages`, summary: 'Caixa de saída com estados e motivos', auth: 'coordinator', query: { status: 'Estados separados por vírgula', kind: 'Tipo', before: 'Paginação por data', limit: '1–200' } },
  { method: 'get', path: `${C}/messages/{id}/simulated`, summary: 'Texto completo de mensagem SIMULADA (nunca de envio real)', auth: 'coordinator' },
  { method: 'post', path: `${C}/messages/{id}/resend`, summary: 'Devolver à fila mensagem bloqueada, com falha ou incerta', auth: 'coordinator' },
  { method: 'get', path: `${C}/reminders`, summary: 'Prévia do próximo lembrete e envios anteriores', auth: 'coordinator' },
  { method: 'get', path: `${C}/whatsapp`, summary: 'Configuração do canal (segredos nunca são devolvidos)', auth: 'coordinator' },
  { method: 'patch', path: `${C}/whatsapp`, summary: 'Alterar modo, credenciais, modo de teste e modelos', auth: 'coordinator', body: channelUpdateSchema },
  { method: 'put', path: `${C}/whatsapp/coexistence`, summary: 'Registrar comprovação de coexistência com o app WhatsApp Business', auth: 'coordinator', body: coexistenceSchema },
  { method: 'get', path: '/api/v1/webhooks/whatsapp', summary: 'Verificação do webhook pela Meta (hub.challenge)', auth: 'none' },
  { method: 'post', path: '/api/v1/webhooks/whatsapp', summary: 'Estados de entrega e mensagens recebidas (PARAR). Exige X-Hub-Signature-256', auth: 'signature' },
  // Liturgia
  { method: 'get', path: `${C}/templates`, summary: 'Modelos de liturgia', auth: 'session' },
  { method: 'post', path: `${C}/templates`, summary: 'Criar modelo', auth: 'coordinator', body: templateSchema },
  { method: 'get', path: `${C}/templates/{id}`, summary: 'Modelo com blocos', auth: 'session' },
  { method: 'patch', path: `${C}/templates/{id}`, summary: 'Alterar modelo e blocos', auth: 'coordinator', body: templateSchema.partial() },
  { method: 'post', path: `${C}/templates/{id}/duplicate`, summary: 'Duplicar modelo (festas, cultos curtos)', auth: 'coordinator', body: z.object({ name: z.string(), kind: z.enum(['regular', 'special', 'short']).optional() }) },
  { method: 'get', path: `${C}/scripts`, summary: 'Situação dos roteiros do mês', auth: 'session', query: month },
  { method: 'get', path: `${C}/scripts/{serviceId}`, summary: 'Roteiro: publicado para todos; rascunho para coordenação, pastores e quem prega', auth: 'session' },
  { method: 'post', path: `${C}/scripts/{serviceId}`, summary: 'Criar roteiro a partir de modelo', auth: 'coordinator', body: z.object({ templateId: z.string().nullable().optional() }) },
  { method: 'patch', path: `${C}/scripts/{serviceId}`, summary: 'Título, dados litúrgicos manuais, quem escolhe músicas, nota pastoral', auth: 'session', body: scriptUpdateSchema },
  { method: 'put', path: `${C}/scripts/{serviceId}/blocks`, summary: 'Substituir blocos (ordem, textos, leituras, avisos)', auth: 'coordinator', body: blocksSchema },
  { method: 'post', path: `${C}/scripts/{serviceId}/publish`, summary: 'Publicar versão imutável', auth: 'coordinator' },
  { method: 'get', path: `${C}/scripts/{serviceId}/versions`, summary: 'Versões publicadas e origem dos dados litúrgicos', auth: 'session' },
  { method: 'get', path: `${C}/scripts/{serviceId}/export`, summary: 'Exportar versão publicada', auth: 'session', query: { format: 'html | txt | json', version: 'Versão (padrão: última)' } },
  { method: 'get', path: `${C}/scripts/{serviceId}/liturgical-data`, summary: 'Consultar o Estêvão e guardar foto; em falha devolve erro e última foto', auth: 'coordinator' },
  { method: 'post', path: `${C}/scripts/{serviceId}/liturgical-data/apply`, summary: 'Aplicar coleta, leituras e calendário escolhidos', auth: 'coordinator', body: applySchema },
  { method: 'put', path: `${C}/scripts/{serviceId}/music`, summary: 'Escolher músicas (quem prega, pastores ou coordenação)', auth: 'session', body: musicSchema },
  { method: 'post', path: `${C}/scripts/{serviceId}/music/notify`, summary: 'Aviso individual ao louvor escalado', auth: 'session' },
  { method: 'get', path: `${C}/songs`, summary: 'Repertório', auth: 'session' },
  { method: 'post', path: `${C}/songs`, summary: 'Cadastrar música', auth: 'session', body: songSchema },
  { method: 'patch', path: `${C}/songs/{id}`, summary: 'Alterar música', auth: 'session', body: songSchema.partial() },
]

export function buildOpenApi() {
  const paths: Record<string, Record<string, unknown>> = {}
  const errorRef = { $ref: '#/components/schemas/Error' }
  for (const r of ROUTES) {
    const params = [...r.path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } }))
    const query = Object.entries(r.query ?? {}).map(([name, description]) => ({ name, in: 'query', required: name === 'month', description, schema: { type: 'string' } }))
    paths[r.path] ??= {}
    paths[r.path]![r.method] = {
      'summary': r.summary,
      'security': r.auth === 'none' || r.auth === 'signature' ? [] : [{ cookie: [] }, { bearer: [] }],
      'x-guilda-access': r.auth,
      'parameters': [...params, ...query],
      ...(r.body ? { requestBody: { required: true, content: { 'application/json': { schema: z.toJSONSchema(r.body, { io: 'input', unrepresentable: 'any' }) } } } } : {}),
      'responses': {
        200: { description: 'Sucesso (JSON)' },
        400: { description: 'Regra de negócio', content: { 'application/json': { schema: errorRef } } },
        401: { description: 'Sem sessão', content: { 'application/json': { schema: errorRef } } },
        403: { description: 'Sem permissão', content: { 'application/json': { schema: errorRef } } },
        404: { description: 'Não encontrado (inclusive recurso de outra igreja)', content: { 'application/json': { schema: errorRef } } },
        409: { description: 'Conflito (versão desatualizada, vaga cheia, troca já resolvida)', content: { 'application/json': { schema: errorRef } } },
        422: { description: 'Validação', content: { 'application/json': { schema: errorRef } } },
      },
    }
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Guilda API',
      version: 'v1',
      description: 'Contrato HTTP da Guilda, usado pela web e por futuros clientes nativos. Datas em ISO 8601 (UTC); meses em AAAA-MM no fuso da igreja.',
    },
    servers: [{ url: '/' }],
    components: {
      securitySchemes: {
        cookie: { type: 'apiKey', in: 'cookie', name: 'guilda_session', description: 'Web: cookie httpOnly. Escritas exigem Origin igual ao app.' },
        bearer: { type: 'http', scheme: 'bearer', description: 'App nativo: token de POST /api/v1/auth/login com client=native.' },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: { error: { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} } } },
        },
      },
    },
    paths,
  }
}
