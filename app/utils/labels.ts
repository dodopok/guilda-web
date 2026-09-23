export const ASSIGNMENT_STATUS: Record<string, { label: string, icon: string, cls: string }> = {
  confirmed: { label: 'Confirmada', icon: 'check', cls: 'status--confirmed' },
  pending: { label: 'A confirmar', icon: 'clock', cls: 'status--pending' },
  declined: { label: 'Não pode', icon: 'x', cls: 'status--declined' },
  not_scheduled: { label: 'Fora da escala', icon: 'info', cls: 'status--neutral' },
}

export const MESSAGE_STATUS: Record<string, { label: string, tone: 'ok' | 'wait' | 'no' | 'info' | 'plain' | 'sim' }> = {
  queued: { label: 'Na fila', tone: 'info' },
  sending: { label: 'Enviando', tone: 'info' },
  sent: { label: 'Enviada', tone: 'ok' },
  delivered: { label: 'Entregue', tone: 'ok' },
  read: { label: 'Lida', tone: 'ok' },
  failed: { label: 'Falhou', tone: 'no' },
  unknown: { label: 'Incerta', tone: 'wait' },
  blocked: { label: 'Não enviada', tone: 'wait' },
  simulated: { label: 'Simulada — não enviada', tone: 'sim' },
  cancelled: { label: 'Cancelada', tone: 'plain' },
}

export const ROLE_LABEL: Record<string, string> = {
  coordinator: 'Coordenação',
  pastor: 'Pastor(a)',
  participant: 'Voluntário(a)',
}

export const BLOCK_TYPE_LABEL: Record<string, string> = {
  heading: 'Título',
  rite: 'Rito',
  reading: 'Leitura',
  psalm: 'Salmo',
  collect: 'Coleta',
  sermon: 'Sermão',
  music: 'Músicas',
  announcements: 'Avisos',
  text: 'Texto livre',
}

export const TEXT_SOURCE_LABEL: Record<string, string> = {
  church: 'Texto da igreja',
  loc_manual: 'Texto do LOC (cadastrado pela coordenação)',
  estevao: 'Estêvão',
  other: 'Outra fonte',
}

export const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

export const LITURGICAL_COLORS = ['verde', 'roxo', 'branco', 'dourado', 'vermelho', 'rosa', 'azul', 'preto']

export function liturgicalKey(color?: string | null) {
  if (!color) return undefined
  const c = color.toLowerCase()
  return LITURGICAL_COLORS.find((k) => c.includes(k))
}

export function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

// Cores dos estados de mensagem (fundo, texto), iguais às do layout.
export const MESSAGE_TINT: Record<string, { label: string, bg: string, fg: string, statuses: string[] }> = {
  blocked: { label: 'Não enviada', bg: '#f0efe9', fg: '#4a5450', statuses: ['blocked', 'cancelled'] },
  queued: { label: 'Na fila', bg: '#e3ebf8', fg: '#2f5fa8', statuses: ['queued', 'sending'] },
  failed: { label: 'Falhou', bg: '#fde4e0', fg: '#8f2a1e', statuses: ['failed'] },
  unknown: { label: 'Incerta', bg: '#fff1d6', fg: '#a86400', statuses: ['unknown'] },
  simulated: { label: 'Simulada', bg: '#efe6fb', fg: '#5b3aa6', statuses: ['simulated'] },
  sent: { label: 'Enviada', bg: '#e3f3e8', fg: '#155f30', statuses: ['sent'] },
  delivered: { label: 'Entregue', bg: '#e3f3e8', fg: '#155f30', statuses: ['delivered'] },
  read: { label: 'Lida', bg: '#d4ecdb', fg: '#0f4d26', statuses: ['read'] },
}
export function messageTint(status: string) {
  const key = Object.keys(MESSAGE_TINT).find((k) => MESSAGE_TINT[k]!.statuses.includes(status)) ?? 'blocked'
  return { key, ...MESSAGE_TINT[key]! }
}

// Blocos de liturgia: cor da etiqueta, frase curta e origem padrão do texto.
export const BLOCK_KINDS: Record<string, { label: string, sub: string, bg: string, fg: string, source: string }> = {
  heading: { label: 'Título', sub: 'Separa partes do culto', bg: '#1d221f', fg: '#fff', source: 'church' },
  rite: { label: 'Rito', sub: 'Texto fixo do LOC', bg: '#f0efe9', fg: '#4a5450', source: 'loc_manual' },
  collect: { label: 'Coleta', sub: 'Vem do Estêvão', bg: '#e3ebf8', fg: '#2f5fa8', source: 'estevao' },
  reading: { label: 'Leitura', sub: 'Vem do Estêvão', bg: '#e3ebf8', fg: '#2f5fa8', source: 'estevao' },
  psalm: { label: 'Salmo', sub: 'Vem do Estêvão', bg: '#e3ebf8', fg: '#2f5fa8', source: 'estevao' },
  sermon: { label: 'Sermão', sub: 'Quem prega escolhe o texto', bg: '#fff1d6', fg: '#a86400', source: 'church' },
  music: { label: 'Músicas', sub: 'Do repertório', bg: '#efe6fb', fg: '#5b3aa6', source: 'church' },
  announcements: { label: 'Avisos', sub: 'Fixos e do período', bg: '#fde4e0', fg: '#8f2a1e', source: 'church' },
  text: { label: 'Texto livre', sub: 'O que precisar', bg: '#f0efe9', fg: '#4a5450', source: 'church' },
}
export const SOURCE_SHORT: Record<string, string> = { church: 'Texto da igreja', loc_manual: 'LOC digitado', estevao: 'Estêvão' }
export const TEMPLATE_KIND: Record<string, string> = { regular: 'Comum', special: 'Especial', short: 'Curto' }

export const TASK_TAG: Record<string, { label: string, bg: string, fg: string }> = {
  pending: { label: 'confirmar', bg: '#fff1d6', fg: '#a86400' },
  confirmed: { label: 'confirmado', bg: '#e3f3e8', fg: '#155f30' },
  declined: { label: 'não pode', bg: '#fde4e0', fg: '#8f2a1e' },
  past: { label: 'feito', bg: '#f0efe9', fg: '#4a5450' },
}

// Papéis além de voluntário(a), para etiquetas: "Coordenação · Pastor(a)".
export function roleTags(roles: string[]) {
  return [roles.includes('coordinator') ? 'Coordenação' : null, roles.includes('pastor') ? 'Pastor(a)' : null].filter((x): x is string => Boolean(x))
}
