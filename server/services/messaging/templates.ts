// Modelos de mensagem. O texto abaixo é o que deve ser submetido à Meta como modelo
// (categoria "utility"), com {{n}} como variáveis. O app usa o mesmo texto para a
// prévia e para o modo de simulação, para que a coordenação veja exatamente o conteúdo.

export type MessageKind =
  | 'invite'
  | 'password_reset'
  | 'availability_request'
  | 'weekly_reminder'
  | 'reminder_correction'
  | 'schedule_published'
  | 'schedule_change'
  | 'swap_invite'
  | 'music_notice'
  | 'coordination_alert'

export interface TemplateDefinition {
  kind: MessageKind
  defaultName: string
  label: string
  body: string
  params: string[]
  // Índice do parâmetro que contém segredo (link de convite ou de senha).
  secretParam?: number
}

export const TEMPLATES: Record<MessageKind, TemplateDefinition> = {
  invite: {
    kind: 'invite',
    defaultName: 'guilda_convite',
    label: 'Convite de acesso',
    body: 'Olá, {{1}}! A coordenação de {{2}} convidou você para a Guilda, onde ficam suas escalas. Crie sua senha por este link, válido por 72 horas: {{3}}',
    params: ['primeiro nome', 'igreja', 'link do convite'],
    secretParam: 2,
  },
  password_reset: {
    kind: 'password_reset',
    defaultName: 'guilda_senha',
    label: 'Redefinição de senha',
    body: 'Olá, {{1}}! Recebemos um pedido para redefinir sua senha da Guilda em {{2}}. Use este link em até 30 minutos: {{3}}. Se não foi você, ignore esta mensagem.',
    params: ['primeiro nome', 'igreja', 'link de redefinição'],
    secretParam: 2,
  },
  availability_request: {
    kind: 'availability_request',
    defaultName: 'guilda_disponibilidade',
    label: 'Pedido de indisponibilidades',
    body: 'Olá, {{1}}! Os cultos de {{2}} em {{3}} estão cadastrados. Marque até {{4}} aqueles em que você não pode servir: {{5}}',
    params: ['primeiro nome', 'mês', 'igreja', 'prazo', 'link'],
  },
  weekly_reminder: {
    kind: 'weekly_reminder',
    defaultName: 'guilda_lembrete',
    label: 'Lembrete semanal',
    body: 'Olá, {{1}}! Lembrete da sua escala em {{2}} nos próximos dias: {{3}}. Detalhes no app: {{4}}. Se precisar de alteração, responda pelo app.',
    params: ['primeiro nome', 'igreja', 'tarefas', 'link'],
  },
  reminder_correction: {
    kind: 'reminder_correction',
    defaultName: 'guilda_correcao',
    label: 'Correção de lembrete',
    body: 'Olá, {{1}}! Sua escala em {{2}} mudou depois do último lembrete. Como fica agora: {{3}}. Detalhes no app: {{4}}',
    params: ['primeiro nome', 'igreja', 'tarefas atualizadas', 'link'],
  },
  schedule_published: {
    kind: 'schedule_published',
    defaultName: 'guilda_escala_publicada',
    label: 'Aviso de escala publicada',
    body: 'Olá, {{1}}! A escala de {{2}} em {{3}} foi publicada. Suas tarefas: {{4}}. Confirme ou recuse pelo app: {{5}}',
    params: ['primeiro nome', 'mês', 'igreja', 'tarefas', 'link'],
  },
  schedule_change: {
    kind: 'schedule_change',
    defaultName: 'guilda_escala_alterada',
    label: 'Aviso de alteração na escala',
    body: 'Olá, {{1}}! A escala de {{2}} em {{3}} foi alterada. Suas tarefas agora: {{4}}. Veja no app: {{5}}',
    params: ['primeiro nome', 'mês', 'igreja', 'tarefas', 'link'],
  },
  swap_invite: {
    kind: 'swap_invite',
    defaultName: 'guilda_troca',
    label: 'Pedido de substituição',
    body: 'Olá, {{1}}! {{2}} pediu que você assuma a tarefa {{3}} em {{4}}. Aceite ou recuse pelo app: {{5}}',
    params: ['primeiro nome', 'quem pediu', 'função', 'culto', 'link'],
  },
  music_notice: {
    kind: 'music_notice',
    defaultName: 'guilda_musicas',
    label: 'Músicas do culto',
    body: 'Olá, {{1}}! As músicas do culto de {{2}} em {{3}} foram definidas: {{4}}. Veja no app: {{5}}',
    params: ['primeiro nome', 'culto', 'igreja', 'músicas', 'link'],
  },
  coordination_alert: {
    kind: 'coordination_alert',
    defaultName: 'guilda_aviso_coordenacao',
    label: 'Aviso à coordenação',
    body: 'Olá, {{1}}! Aviso da escala de {{2}}: {{3}}. Veja as pendências: {{4}}',
    params: ['primeiro nome', 'igreja', 'ocorrido', 'link'],
  },
}

// A Cloud API rejeita parâmetros de modelo com quebra de linha, tabulação ou mais de
// quatro espaços seguidos. Também limitamos o tamanho para caber no corpo do modelo.
export function sanitizeParam(value: string, max = 700): string {
  const clean = value.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

export function renderTemplate(kind: MessageKind, params: string[]): string {
  const def = TEMPLATES[kind]
  return def.body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? '')
}

// Texto exibido no painel: o link secreto aparece mascarado.
export function renderPreview(kind: MessageKind, params: string[]): string {
  const def = TEMPLATES[kind]
  const masked = params.map((p, i) => (i === def.secretParam ? '[link individual]' : p))
  return renderTemplate(kind, masked)
}
