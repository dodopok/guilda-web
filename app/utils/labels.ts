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
  pastor: 'Pastoral',
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
