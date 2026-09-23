// Cálculo dos alertas da escala. Função pura sobre os dados do mês para facilitar teste.
// Nenhum alerta bloqueia a publicação: são sinais para revisão humana.

export interface AlertInput {
  services: { id: string, title: string, startsAt: Date, endsAt: Date, status: string, localDate: string }[]
  slots: { id: string, serviceId: string, dutyId: string, requiredCount: number, startsAt: Date | null, endsAt: Date | null }[]
  duties: { id: string, name: string }[]
  assignments: { id: string, slotId: string, personId: string, status: string, exceptional: boolean, exceptionReason: string | null }[]
  people: { id: string, displayName: string, roles: string[], restExempt: boolean, status: string }[]
  qualifications: { personId: string, dutyId: string }[]
  unavailabilities: { personId: string, serviceId: string, createdAt: Date }[]
  publishedAt: Date | null
}

export type AlertType =
  | 'vacancy'
  | 'unavailable'
  | 'not_qualified'
  | 'exceptional'
  | 'clash'
  | 'same_day_load'
  | 'no_rest'
  | 'without_task'
  | 'declined'
  | 'inactive_person'

export interface Alert {
  type: AlertType
  severity: 'strong' | 'warning' | 'info'
  message: string
  personId?: string
  serviceId?: string
  slotId?: string
  assignmentIds?: string[]
  late?: boolean
}

export const SAME_DAY_LOAD_THRESHOLD = 3

function shortDate(localDate: string) {
  const [, m, d] = localDate.split('-')
  return `${d}/${m}`
}

export function isRestExempt(p: { roles: string[], restExempt: boolean }) {
  return p.roles.includes('pastor') || p.restExempt
}

export function computeAlerts(input: AlertInput): { alerts: Alert[], people: PersonLoad[] } {
  const alerts: Alert[] = []
  const serviceById = new Map(input.services.map((s) => [s.id, s]))
  const slotById = new Map(input.slots.map((s) => [s.id, s]))
  const dutyName = new Map(input.duties.map((d) => [d.id, d.name]))
  const personById = new Map(input.people.map((p) => [p.id, p]))
  const qualified = new Set(input.qualifications.map((q) => `${q.personId}:${q.dutyId}`))
  const unavailable = new Map(input.unavailabilities.map((u) => [`${u.personId}:${u.serviceId}`, u]))
  const activeServices = input.services.filter((s) => s.status === 'scheduled')
  const activeServiceIds = new Set(activeServices.map((s) => s.id))
  const live = input.assignments.filter((a) => {
    const slot = slotById.get(a.slotId)
    return slot && activeServiceIds.has(slot.serviceId)
  })
  const name = (id: string) => personById.get(id)?.displayName ?? 'Pessoa'
  const describeSlot = (slotId: string) => {
    const slot = slotById.get(slotId)!
    const svc = serviceById.get(slot.serviceId)!
    return `${dutyName.get(slot.dutyId) ?? 'Função'} em ${svc.title} (${shortDate(svc.localDate)})`
  }

  // Vagas e recusas
  for (const slot of input.slots) {
    if (!activeServiceIds.has(slot.serviceId)) continue
    const inSlot = live.filter((a) => a.slotId === slot.id)
    const filled = inSlot.filter((a) => a.status !== 'declined').length
    if (filled < slot.requiredCount) {
      const missing = slot.requiredCount - filled
      alerts.push({ type: 'vacancy', severity: 'strong', message: `${describeSlot(slot.id)}: falta${missing > 1 ? 'm' : ''} ${missing} pessoa${missing > 1 ? 's' : ''}.`, serviceId: slot.serviceId, slotId: slot.id })
    }
    for (const a of inSlot.filter((x) => x.status === 'declined')) {
      alerts.push({ type: 'declined', severity: 'strong', message: `${name(a.personId)} recusou ${describeSlot(slot.id)}.`, personId: a.personId, slotId: slot.id, assignmentIds: [a.id] })
    }
  }

  // Indisponibilidade, habilitação e pessoa inativa
  for (const a of live) {
    const slot = slotById.get(a.slotId)!
    const u = unavailable.get(`${a.personId}:${slot.serviceId}`)
    if (u && a.status !== 'declined') {
      const late = input.publishedAt ? u.createdAt > input.publishedAt : false
      alerts.push({
        type: 'unavailable',
        severity: 'strong',
        message: `${name(a.personId)} informou indisponibilidade para ${describeSlot(slot.id)}${late ? ' depois da publicação' : ''}.`,
        personId: a.personId, serviceId: slot.serviceId, slotId: slot.id, assignmentIds: [a.id], late,
      })
    }
    if (!qualified.has(`${a.personId}:${slot.dutyId}`)) {
      alerts.push(a.exceptional
        ? { type: 'exceptional', severity: 'info', message: `Designação excepcional de ${name(a.personId)} em ${describeSlot(slot.id)}: ${a.exceptionReason ?? 'sem motivo'}.`, personId: a.personId, slotId: slot.id, assignmentIds: [a.id] }
        : { type: 'not_qualified', severity: 'strong', message: `${name(a.personId)} não está habilitado(a) para ${describeSlot(slot.id)}.`, personId: a.personId, slotId: slot.id, assignmentIds: [a.id] })
    }
    if (personById.get(a.personId)?.status !== 'active') {
      alerts.push({ type: 'inactive_person', severity: 'strong', message: `${name(a.personId)} está inativo(a) e aparece em ${describeSlot(slot.id)}.`, personId: a.personId, assignmentIds: [a.id] })
    }
  }

  // Por pessoa: choques, carga no mesmo dia e folga
  const byPerson = new Map<string, typeof live>()
  for (const a of live.filter((x) => x.status !== 'declined')) byPerson.set(a.personId, [...(byPerson.get(a.personId) ?? []), a])

  const window = (slotId: string) => {
    const slot = slotById.get(slotId)!
    const svc = serviceById.get(slot.serviceId)!
    return { start: slot.startsAt ?? svc.startsAt, end: slot.endsAt ?? svc.endsAt, explicit: Boolean(slot.startsAt && slot.endsAt), serviceId: svc.id }
  }

  for (const [personId, list] of byPerson) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = window(list[i]!.slotId)
        const b = window(list[j]!.slotId)
        const overlap = a.start < b.end && b.start < a.end
        if (!overlap) continue
        // No mesmo culto, tarefas sem horário próprio são sequenciais, não choque.
        if (a.serviceId === b.serviceId && !(a.explicit && b.explicit)) continue
        alerts.push({
          type: 'clash',
          severity: 'strong',
          message: `${name(personId)} tem tarefas no mesmo horário: ${describeSlot(list[i]!.slotId)} e ${describeSlot(list[j]!.slotId)}.`,
          personId,
          assignmentIds: [list[i]!.id, list[j]!.id],
        })
      }
    }
    const byDate = new Map<string, string[]>()
    for (const a of list) {
      const svc = serviceById.get(slotById.get(a.slotId)!.serviceId)!
      byDate.set(svc.localDate, [...(byDate.get(svc.localDate) ?? []), a.id])
    }
    for (const [date, ids] of byDate) {
      if (ids.length >= SAME_DAY_LOAD_THRESHOLD) {
        alerts.push({ type: 'same_day_load', severity: 'warning', message: `${name(personId)} tem ${ids.length} tarefas em ${shortDate(date)}. Confira se são sequenciais e viáveis.`, personId, assignmentIds: ids })
      }
    }
  }

  // Domingos com culto no mês
  const sundays = new Set(activeServices.filter((s) => new Date(`${s.localDate}T12:00:00Z`).getUTCDay() === 0).map((s) => s.localDate))
  const loads: PersonLoad[] = []
  for (const p of input.people.filter((x) => x.status === 'active')) {
    const list = byPerson.get(p.id) ?? []
    const dates = new Set(list.map((a) => serviceById.get(slotById.get(a.slotId)!.serviceId)!.localDate))
    const sundaysServed = [...sundays].filter((d) => dates.has(d)).length
    loads.push({
      personId: p.id,
      displayName: p.displayName,
      tasks: list.length,
      daysServed: dates.size,
      sundaysServed,
      sundaysFree: sundays.size - sundaysServed,
      restExempt: isRestExempt(p),
    })
    if (!isRestExempt(p) && sundays.size >= 2 && sundaysServed === sundays.size) {
      alerts.push({ type: 'no_rest', severity: 'warning', message: `${p.displayName} está escalado(a) em todos os ${sundays.size} domingos do mês, sem domingo livre.`, personId: p.id })
    }
  }

  // Habilitados e disponíveis sem tarefa no mês
  const dutiesInMonth = new Set(input.slots.filter((s) => activeServiceIds.has(s.serviceId)).map((s) => s.dutyId))
  for (const p of input.people.filter((x) => x.status === 'active')) {
    if ((byPerson.get(p.id) ?? []).length) continue
    const canServe = input.qualifications.filter((q) => q.personId === p.id && dutiesInMonth.has(q.dutyId))
    if (!canServe.length) continue
    const availableSomewhere = activeServices.some((s) => !unavailable.has(`${p.id}:${s.id}`))
    if (!availableSomewhere) continue
    const names = [...new Set(canServe.map((q) => dutyName.get(q.dutyId)).filter(Boolean))].join(', ')
    alerts.push({ type: 'without_task', severity: 'info', message: `${p.displayName} está habilitado(a) e disponível, sem tarefa no mês (${names}).`, personId: p.id })
  }

  return { alerts, people: loads }
}

export interface PersonLoad {
  personId: string
  displayName: string
  tasks: number
  daysServed: number
  sundaysServed: number
  sundaysFree: number
  restExempt: boolean
}
