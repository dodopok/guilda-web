// Formas das respostas da API v1 usadas pela interface (datas chegam como texto ISO).

export interface Membership {
  churchId: string
  slug: string
  name: string
  timezone: string
  accentColor: string
  city: string | null
  personId: string
  displayName: string
  roles: string[]
}

export interface MeResponse {
  account: { id: string, displayName: string, login: string | null, isPlatformAdmin: boolean }
  memberships: Membership[]
}

export interface Church {
  id: string
  slug: string
  name: string
  timezone: string
  defaultLocation: string | null
  city: string | null
  reminderEnabled: boolean
  reminderWeekday: number
  reminderTime: string
  reminderWindowDays: number
  confirmationDeadlineHours: number
  liturgicalPrayerBook: string
  liturgicalReadingType: string
  accentColor: string
  setupCompleted: boolean
}

export interface ChurchInfo {
  church: Church
  me: { personId: string, roles: string[] }
  liturgicalColor: string | null
  whatsappMode: 'disabled' | 'simulation' | 'cloud_api' | 'ycloud' | null
  logoVersion: number | null
  attention: number
}

export interface Task {
  assignmentId: string
  personId: string
  status: 'pending' | 'confirmed' | 'declined'
  rowVersion: number
  service: { id: string, title: string, startsAt: string, localDate: string, time: string, location: string | null, status: string }
  duty: { id: string, name: string, instructions: string | null, ministry: string, kind: string }
  arrivalAt: string | null
  coworkers: { personId: string, displayName: string, duties: string[] }[]
  note: string | null
  respondBy: string
  openSwaps: { id: string, candidateName: string, createdAt: string }[]
}

export interface HomeResponse {
  tasks: Task[]
  swapsWaiting: number
  availability: { month: string, monthLabel: string, deadlineAt: string, responded: boolean, respondedAt: string | null }[]
  nextScript: { serviceId: string, title: string, startsAt: string, color: string | null } | null
  isCoordinator: boolean
  serviceLiturgy: Record<string, { color: string | null, season: string | null, sundayName: string | null }>
  nextMonth: { month: string, monthLabel: string, published: boolean, hasServices: boolean }
}

export interface Swap {
  id: string
  status: string
  message: string | null
  createdAt: string
  respondedAt: string | null
  direction: 'received' | 'sent'
  assignmentId: string
  serviceId: string
  fromName: string
  candidateName: string
  dutyName: string
  serviceTitle: string
  startsAt: string
  location: string | null
  arrivalAt: string | null
  coworkers: string[]
}

export interface Ministry { id: string, name: string, description: string | null, position: number }
export interface Duty {
  id: string
  ministryId: string
  name: string
  instructions: string | null
  arrivalMinutesBefore: number | null
  kind: string
  receivesMusicNotice: boolean
  defaultRequiredCount: number
  includeByDefault: boolean
  inScript: boolean
  active: boolean
  position: number
}

export interface PersonAdmin {
  id: string
  displayName: string
  phone: string | null
  roles: string[]
  restExempt: boolean
  status: 'active' | 'inactive'
  notes: string | null
  hasAccount: boolean
  consent: { status: string, source: string, updatedAt: string, evidenceNote: string | null } | null
  invite: { createdAt: string, state: 'pending' | 'used' | 'expired' | 'revoked' } | null
  dutyIds: string[]
}

export interface Slot {
  id: string
  serviceId: string
  dutyId: string
  dutyName: string
  dutyKind: string
  position: number
  requiredCount: number
  arrivalAt: string | null
  startsAt: string | null
  endsAt: string | null
  note: string | null
}

export interface ServiceRow {
  id: string
  title: string
  startsAt: string
  endsAt: string
  localDate: string
  month: string
  time: string
  location: string | null
  kind: 'regular' | 'special' | 'short'
  status: 'scheduled' | 'cancelled'
  notes: string | null
  slots: Slot[]
}

export interface Alert {
  type: string
  severity: 'strong' | 'warning' | 'info'
  message: string
  personId?: string
  serviceId?: string
  slotId?: string
  assignmentIds?: string[]
  late?: boolean
}

export interface EditorAssignment { id: string, personId: string, personName: string, status: string, exceptional: boolean, exceptionReason: string | null }
export interface EditorSlot { id: string, dutyId: string, requiredCount: number, arrivalAt: string | null, startsAt: string | null, endsAt: string | null, note: string | null, assignments: EditorAssignment[] }
export interface EditorService {
  id: string
  title: string
  startsAt: string
  endsAt: string
  localDate: string
  time: string
  location: string | null
  kind: string
  status: string
  unavailablePersonIds: string[]
  slots: EditorSlot[]
}
export interface PersonLoad { personId: string, displayName: string, tasks: number, daysServed: number, sundaysServed: number, sundaysFree: number, restExempt: boolean }
export interface ScheduleEditor {
  month: string
  monthLabel: string
  status: 'draft' | 'published'
  version: number
  publishedAt: string | null
  services: EditorService[]
  duties: { id: string, name: string, ministryId: string, kind: string, active: boolean, arrivalMinutesBefore: number | null }[]
  ministries: { id: string, name: string }[]
  people: { id: string, displayName: string, roles: string[], dutyIds: string[] }[]
  alerts: Alert[]
  loads: PersonLoad[]
}

export interface MessageRow {
  id: string
  kind: string
  kindLabel: string
  personId: string | null
  personName: string | null
  toPhoneLast4: string | null
  status: string
  blockedReason: string | null
  blockedReasonText: string | null
  provider: string | null
  attempts: number
  lastError: string | null
  createdAt: string
  sentAt: string | null
  deliveredAt: string | null
  readAt: string | null
  preview: string
}

export interface ScriptBlock {
  id: string
  position: number
  type: string
  title: string
  body: string | null
  textSource: string
  dutyId: string | null
  personId: string | null
  data: BlockData
  responsibles: { personId: string, name: string, status: string, scheduled: boolean }[]
  songs: Song[]
  readerNotified?: boolean
}

export interface BlockData {
  reference?: string
  alternatives?: string[]
  source?: 'estevao' | 'manual'
  slot?: string
  songIds?: string[]
  songKeys?: Record<string, string>
  responses?: import('#shared/liturgy').ReadingResponses
  items?: { text: string, ownerPersonId?: string | null, status?: 'draft' | 'ready', fixed?: boolean }[]
  templateBody?: string | null
}

export interface Song { id: string, title: string, author: string | null, musicalKey: string | null, link: string | null, notes: string | null }

export interface PublishedBlock {
  id: string
  type: string
  title: string
  body: string | null
  textSource: string
  dutyId: string | null
  personId: string | null
  reference: string | null
  responsibles: { name: string, status: string }[]
  songs: { title: string, author: string | null, musicalKey: string | null, link: string | null }[]
  // Anúncio antes e resposta ao final (leituras e salmo), já resolvidos.
  responses?: { open?: { leader: string, people: string }, close?: { leader: string, people: string } }
  items: { text: string, owner: string | null, status: string }[]
}

export interface PublishedContent {
  title: string
  service: { id: string, title: string, startsAt: string, localDate: string, time: string, location: string | null }
  liturgy: { color?: string | null, celebration?: string | null, sundayName?: string | null, season?: string | null, source?: string }
  liturgicalSource: { source: string, prayerBook?: string, fetchedAt?: string, requestPath?: string }
  blocks: PublishedBlock[]
}

export interface ScriptView {
  service: { id: string, title: string, startsAt: string, localDate: string, time: string, location: string | null, kind: string, status: string }
  canEdit: boolean
  canPublish?: boolean
  canChooseMusic: boolean
  published: { version: number, publishedAt: string, content: PublishedContent } | null
  draft: null | {
    id: string
    title: string
    status: string
    version: number
    templateId: string | null
    liturgy: PublishedContent['liturgy']
    pastoralNote: string | null
    musicChooser: 'preacher' | 'pastors'
    updatedAt: string
    // Modelo de origem; changedSince = o modelo mudou depois de aplicado a este roteiro.
    template: { id: string, name: string, archived: boolean, changedSince: boolean } | null
    // Funções escaladas neste culto que nenhum bloco do roteiro mostra.
    dutiesOutside: { id: string, name: string }[]
    snapshot: { id: string, source: string, fetchedAt: string, requestPath: string | null, prayerBook: string } | null
    blocks: ScriptBlock[]
    hasUnpublishedChanges: boolean
  }
  needsReview: { required: boolean, changes: { blockTitle: string, published: string[], current: string[] }[] } | null
}

export interface LiturgicalSuggestion {
  date: string
  sundayName: string | null
  proper?: string | null
  season: string | null
  color: string | null
  celebration: string | null
  celebrations: string[]
  collects: { title: string, text: string }[]
  readings: { key: string, label: string, reference: string, alternatives: string[] }[]
}

export interface EditableBlock {
  key: string
  type: string
  title: string
  body: string | null
  textSource: string
  dutyId: string | null
  personId: string | null
  data: BlockData
  responsibles?: { name: string, status: string }[]
  songs?: { title: string }[]
}
