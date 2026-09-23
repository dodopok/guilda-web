// Modelos de mensagem, como devem ser cadastrados no YCloud / gerenciador da Meta.
// - Utilidade: variáveis NOMEADAS ({{nome}}), cada uma com exemplo, como o YCloud pede.
//   O envio informa parameter_name de cada variável.
// - Autenticação (senha): formato fixo da Meta, só com o código (sem link nem texto livre)
//   e botão "Copiar código". A Meta recusa como utilidade qualquer mensagem de senha/acesso.
// O app usa o mesmo texto na prévia e no modo de simulação.

export type MessageKind
  = | 'invite'
    | 'password_reset'
    | 'availability_request'
    | 'weekly_reminder'
    | 'reminder_correction'
    | 'schedule_published'
    | 'schedule_change'
    | 'swap_invite'
    | 'music_notice'
    | 'reading_notice'
    | 'coordination_alert'

export type TemplateCategory = 'UTILITY' | 'AUTHENTICATION'
export interface TemplateVar { name: string, label: string, example: string }

export interface TemplateDefinition {
  kind: MessageKind
  defaultName: string
  label: string
  category: TemplateCategory
  body: string
  vars: TemplateVar[]
  // Índice da variável que contém segredo (link de convite ou código de senha).
  secretParam?: number
  // Só autenticação: minutos de validade informados no rodapé do modelo.
  codeExpirationMinutes?: number
}

const v = (name: string, label: string, example: string): TemplateVar => ({ name, label, example })
const NOME = v('nome', 'primeiro nome', 'Maria')
const IGREJA = v('igreja', 'igreja', 'Anglicana Porto')
const LINK = v('link', 'link no app', 'https://guilda.anglicanaporto.com.br/i/anglicana-porto')

export const TEMPLATES: Record<MessageKind, TemplateDefinition> = {
  invite: {
    kind: 'invite',
    defaultName: 'guilda_convite',
    label: 'Boas-vindas à escala',
    category: 'UTILITY',
    // Sem "senha", "acesso" ou "login": é aviso de cadastro na escala, não autenticação.
    body: 'Olá, {{nome}}! A coordenação de {{igreja}} incluiu você na escala de voluntários pela Guilda. Por este link você vê suas tarefas e confirma presença (vale por 72 horas): {{link}}',
    vars: [NOME, IGREJA, v('link', 'link individual', 'https://guilda.anglicanaporto.com.br/convite/Ab12Cd34')],
    secretParam: 2,
  },
  password_reset: {
    kind: 'password_reset',
    defaultName: 'guilda_codigo',
    label: 'Código para nova senha',
    category: 'AUTHENTICATION',
    body: '*{{1}}* é seu código de verificação. Para sua segurança, não o compartilhe.',
    vars: [v('1', 'código', '482915')],
    secretParam: 0,
    codeExpirationMinutes: 10,
  },
  availability_request: {
    kind: 'availability_request',
    defaultName: 'guilda_disponibilidade',
    label: 'Pedido de indisponibilidades',
    category: 'UTILITY',
    body: 'Olá, {{nome}}! Os cultos de {{mes}} em {{igreja}} estão cadastrados. Marque até {{prazo}} aqueles em que você não pode servir: {{link}}',
    vars: [NOME, v('mes', 'mês', 'outubro'), IGREJA, v('prazo', 'prazo', 'sábado, 26/09, às 22h'), LINK],
  },
  weekly_reminder: {
    kind: 'weekly_reminder',
    defaultName: 'guilda_lembrete',
    label: 'Lembrete semanal',
    category: 'UTILITY',
    body: 'Olá, {{nome}}! Lembrete da sua escala em {{igreja}} nos próximos dias: {{tarefas}}. Detalhes no app: {{link}}. Se precisar de alteração, responda pelo app.',
    vars: [NOME, IGREJA, v('tarefas', 'tarefas', 'domingo 27/09, 9h30: Leitura (chegar 9h10)'), LINK],
  },
  reminder_correction: {
    kind: 'reminder_correction',
    defaultName: 'guilda_correcao',
    label: 'Correção de lembrete',
    category: 'UTILITY',
    body: 'Olá, {{nome}}! Sua escala em {{igreja}} mudou depois do último lembrete. Como fica agora: {{tarefas}}. Detalhes no app: {{link}}',
    vars: [NOME, IGREJA, v('tarefas', 'tarefas atualizadas', 'domingo 27/09, 9h30: Café da manhã'), LINK],
  },
  schedule_published: {
    kind: 'schedule_published',
    defaultName: 'guilda_escala_publicada',
    label: 'Aviso de escala publicada',
    category: 'UTILITY',
    body: 'Olá, {{nome}}! A escala de {{mes}} em {{igreja}} foi publicada. Suas tarefas: {{tarefas}}. Confirme ou recuse pelo app: {{link}}',
    vars: [NOME, v('mes', 'mês', 'outubro'), IGREJA, v('tarefas', 'tarefas', 'dom 04/10: Leitura; dom 18/10: Café'), LINK],
  },
  schedule_change: {
    kind: 'schedule_change',
    defaultName: 'guilda_escala_alterada',
    label: 'Aviso de alteração na escala',
    category: 'UTILITY',
    body: 'Olá, {{nome}}! A escala de {{mes}} em {{igreja}} foi alterada. Suas tarefas agora: {{tarefas}}. Veja no app: {{link}}',
    vars: [NOME, v('mes', 'mês', 'outubro'), IGREJA, v('tarefas', 'tarefas', 'dom 11/10: Leitura'), LINK],
  },
  swap_invite: {
    kind: 'swap_invite',
    defaultName: 'guilda_troca',
    label: 'Pedido de substituição',
    category: 'UTILITY',
    body: 'Olá, {{nome}}! {{quem_pediu}} pediu que você assuma a tarefa {{funcao}} em {{culto}}. Aceite ou recuse pelo app: {{link}}',
    vars: [NOME, v('quem_pediu', 'quem pediu', 'João'), v('funcao', 'função', 'Leitura'), v('culto', 'culto', 'domingo, 04/10, 9h30'), LINK],
  },
  music_notice: {
    kind: 'music_notice',
    defaultName: 'guilda_musicas',
    label: 'Músicas do culto',
    category: 'UTILITY',
    body: 'Olá, {{nome}}! As músicas do culto de {{culto}} em {{igreja}} foram definidas: {{musicas}}. Veja no app: {{link}}',
    vars: [NOME, v('culto', 'culto', 'domingo, 04/10'), IGREJA, v('musicas', 'músicas', 'Grande é o Senhor (tom G), Santo, Santo, Santo (tom D)'), LINK],
  },
  reading_notice: {
    kind: 'reading_notice',
    defaultName: 'guilda_leitura',
    label: 'Aviso de leitura',
    category: 'UTILITY',
    body: 'Olá, {{nome}}! Você lê {{leitura}} no culto de {{culto}} em {{igreja}}: {{referencia}}. Veja o roteiro no app: {{link}}',
    vars: [NOME, v('leitura', 'leitura', 'a Primeira leitura'), v('culto', 'culto', 'domingo, 04/10'), IGREJA, v('referencia', 'referência', 'Isaías 5.1-7'), LINK],
  },
  coordination_alert: {
    kind: 'coordination_alert',
    defaultName: 'guilda_aviso_coordenacao',
    label: 'Aviso à coordenação',
    category: 'UTILITY',
    body: 'Olá, {{nome}}! Aviso da escala de {{igreja}}: {{ocorrido}}. Veja as pendências: {{link}}',
    vars: [NOME, IGREJA, v('ocorrido', 'ocorrido', 'Maria avisou que não pode servir no domingo 04/10'), LINK],
  },
}

// Nomes das variáveis na ordem dos parâmetros; vazio para modelos posicionais (autenticação).
export function paramNames(kind: MessageKind): string[] | undefined {
  const def = TEMPLATES[kind]
  return def.category === 'AUTHENTICATION' ? undefined : def.vars.map((x) => x.name)
}

// A Cloud API rejeita parâmetros de modelo com quebra de linha, tabulação ou mais de
// quatro espaços seguidos. Também limitamos o tamanho para caber no corpo do modelo.
export function sanitizeParam(value: string, max = 700): string {
  const clean = value.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

export function renderTemplate(kind: MessageKind, params: string[]): string {
  const def = TEMPLATES[kind]
  return def.body.replace(/\{\{([a-z0-9_]+)\}\}/g, (_, name: string) => params[def.vars.findIndex((x) => x.name === name)] ?? '')
}

// Texto exibido no painel: o link secreto aparece mascarado.
export function renderPreview(kind: MessageKind, params: string[]): string {
  const def = TEMPLATES[kind]
  const masked = params.map((p, i) => (i === def.secretParam ? (def.category === 'AUTHENTICATION' ? '••••••' : '[link individual]') : p))
  return renderTemplate(kind, masked)
}
