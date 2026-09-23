import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

// Convenções
// - Toda tabela com dados de uma comunidade tem church_id.
// - Tabelas referenciadas por outras têm UNIQUE (church_id, id), e as referências usam
//   chave estrangeira composta (church_id, x_id). Assim o próprio banco impede que um
//   registro de uma igreja aponte para pessoa, culto ou posto de outra.
// - Instantes são timestamptz (UTC); datas locais são calculadas no fuso da igreja.

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })
const createdAt = () => ts('created_at').notNull().defaultNow()

// ---------------------------------------------------------------------------
// Igrejas e contas
// ---------------------------------------------------------------------------

export const churches = pgTable('churches', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull().default('America/Sao_Paulo'),
  status: text('status').notNull().default('active'),
  defaultLocation: text('default_location'),
  // Lembrete semanal: dia da semana (0 = domingo) e horário local HH:MM.
  reminderEnabled: boolean('reminder_enabled').notNull().default(false),
  reminderWeekday: integer('reminder_weekday').notNull().default(4),
  reminderTime: text('reminder_time').notNull().default('19:00'),
  reminderWindowDays: integer('reminder_window_days').notNull().default(7),
  reminderConfigUpdatedAt: ts('reminder_config_updated_at').notNull().defaultNow(),
  // Prazo padrão para responder a uma tarefa publicada (horas antes do culto).
  confirmationDeadlineHours: integer('confirmation_deadline_hours').notNull().default(48),
  // Preferências litúrgicas usadas na consulta ao Estêvão.
  liturgicalPrayerBook: text('liturgical_prayer_book').notNull().default('loc_2027'),
  liturgicalReadingType: text('liturgical_reading_type').notNull().default('complementary'),
  // Identidade visual: cor da igreja (hex) usada nos botões e destaques do app.
  accentColor: text('accent_color').notNull().default('#2c5a41'),
  city: text('city'),
  // Configuração inicial concluída pela coordenação (nula em igreja recém-criada).
  setupCompletedAt: ts('setup_completed_at'),
  createdAt: createdAt(),
}, (t) => [
  check('churches_accent_color', sql`${t.accentColor} ~ '^#[0-9a-f]{6}$'`),
  check('churches_reminder_weekday', sql`${t.reminderWeekday} between 0 and 6`),
  check('churches_reminder_time', sql`${t.reminderTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
  check('churches_slug', sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
])

// Logo da igreja, fora da tabela principal para não pesar nas consultas. Só PNG, JPEG ou
// WebP (conferidos pelos bytes iniciais), já reduzido no navegador.
export const churchLogos = pgTable('church_logos', {
  churchId: uuid('church_id').primaryKey().references(() => churches.id, { onDelete: 'cascade' }),
  mime: text('mime').notNull(),
  dataBase64: text('data_base64').notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Identificador de login: telefone E.164 para quem entrou por convite do WhatsApp.
  login: text('login').notNull().unique(),
  passwordHash: text('password_hash'),
  displayName: text('display_name').notNull(),
  isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
  status: text('status').notNull().default('active'),
  failedLoginCount: integer('failed_login_count').notNull().default(0),
  lockedUntil: ts('locked_until'),
  passwordChangedAt: ts('password_changed_at'),
  createdAt: createdAt(),
})

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: text('token_hash').notNull().unique(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  client: text('client').notNull().default('web'),
  userAgent: text('user_agent'),
  createdAt: createdAt(),
  expiresAt: ts('expires_at').notNull(),
  lastUsedAt: ts('last_used_at').notNull().defaultNow(),
  revokedAt: ts('revoked_at'),
}, (t) => [index('sessions_account_idx').on(t.accountId)])

// ---------------------------------------------------------------------------
// Pessoas, papéis e consentimento
// ---------------------------------------------------------------------------

export const people = pgTable('people', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  displayName: text('display_name').notNull(),
  // Chave normalizada (sem acentos, minúsculas) usada só para conciliar importações.
  nameKey: text('name_key').notNull(),
  phoneE164: text('phone_e164'),
  // coordinator | pastor | participant
  roles: text('roles').array().notNull().default(sql`ARRAY['participant']::text[]`),
  // Exceção configurável da meta de folga, além dos pastores.
  restExempt: boolean('rest_exempt').notNull().default(false),
  status: text('status').notNull().default('active'),
  notes: text('notes'),
  createdAt: createdAt(),
}, (t) => [
  unique('people_church_id_uq').on(t.churchId, t.id),
  uniqueIndex('people_church_account_uq').on(t.churchId, t.accountId).where(sql`${t.accountId} is not null`),
  uniqueIndex('people_church_phone_uq').on(t.churchId, t.phoneE164).where(sql`${t.phoneE164} is not null`),
  index('people_church_idx').on(t.churchId),
])

export const personAliases = pgTable('person_aliases', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  personId: uuid('person_id').notNull(),
  aliasKey: text('alias_key').notNull(),
  createdAt: createdAt(),
}, (t) => [
  unique('person_aliases_uq').on(t.churchId, t.aliasKey),
  foreignKey({ columns: [t.churchId, t.personId], foreignColumns: [people.churchId, people.id] }).onDelete('cascade'),
])

export const consents = pgTable('consents', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  personId: uuid('person_id').notNull(),
  channel: text('channel').notNull().default('whatsapp'),
  // Finalidade registrada: mensagens individuais sobre escalas, convites e roteiros.
  purpose: text('purpose').notNull().default('service_messages'),
  status: text('status').notNull(), // granted | revoked
  grantedAt: ts('granted_at'),
  revokedAt: ts('revoked_at'),
  source: text('source').notNull(), // presencial | formulario | app | whatsapp
  evidenceNote: text('evidence_note'),
  recordedByAccountId: uuid('recorded_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [
  unique('consents_person_channel_uq').on(t.churchId, t.personId, t.channel, t.purpose),
  foreignKey({ columns: [t.churchId, t.personId], foreignColumns: [people.churchId, people.id] }).onDelete('cascade'),
])

// Convites e redefinições de senha: token aleatório guardado só como hash.
export const authTokens = pgTable('auth_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  purpose: text('purpose').notNull(), // invite | password_reset | password_code
  tokenHash: text('token_hash').notNull().unique(),
  // Tentativas erradas (códigos de 6 dígitos): passa do limite, o código é revogado.
  attempts: integer('attempts').notNull().default(0),
  churchId: uuid('church_id').references(() => churches.id, { onDelete: 'cascade' }),
  personId: uuid('person_id'),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
  createdByAccountId: uuid('created_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
  revokedAt: ts('revoked_at'),
  createdAt: createdAt(),
}, (t) => [
  foreignKey({ columns: [t.churchId, t.personId], foreignColumns: [people.churchId, people.id] }).onDelete('cascade'),
  index('auth_tokens_person_idx').on(t.personId),
])

// ---------------------------------------------------------------------------
// Ministérios, funções e habilitações
// ---------------------------------------------------------------------------

export const ministries = pgTable('ministries', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  position: integer('position').notNull().default(0),
  createdAt: createdAt(),
}, (t) => [
  unique('ministries_church_id_uq').on(t.churchId, t.id),
  unique('ministries_church_name_uq').on(t.churchId, t.name),
])

export const duties = pgTable('duties', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  ministryId: uuid('ministry_id').notNull(),
  name: text('name').notNull(),
  instructions: text('instructions'),
  // Minutos antes do início do culto. Nulo = horário de chegada ainda não definido.
  arrivalMinutesBefore: integer('arrival_minutes_before'),
  // general | sermon | reading | presiding | music
  kind: text('kind').notNull().default('general'),
  receivesMusicNotice: boolean('receives_music_notice').notNull().default(false),
  defaultRequiredCount: integer('default_required_count').notNull().default(1),
  // Função incluída automaticamente nos postos de um culto novo.
  includeByDefault: boolean('include_by_default').notNull().default(true),
  active: boolean('active').notNull().default(true),
  position: integer('position').notNull().default(0),
  createdAt: createdAt(),
}, (t) => [
  unique('duties_church_id_uq').on(t.churchId, t.id),
  unique('duties_church_ministry_name_uq').on(t.churchId, t.ministryId, t.name),
  foreignKey({ columns: [t.churchId, t.ministryId], foreignColumns: [ministries.churchId, ministries.id] }),
  check('duties_required_count', sql`${t.defaultRequiredCount} between 1 and 50`),
])

export const qualifications = pgTable('qualifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  personId: uuid('person_id').notNull(),
  dutyId: uuid('duty_id').notNull(),
  validFrom: date('valid_from'),
  validUntil: date('valid_until'),
  createdAt: createdAt(),
}, (t) => [
  unique('qualifications_uq').on(t.churchId, t.personId, t.dutyId),
  foreignKey({ columns: [t.churchId, t.personId], foreignColumns: [people.churchId, people.id] }).onDelete('cascade'),
  foreignKey({ columns: [t.churchId, t.dutyId], foreignColumns: [duties.churchId, duties.id] }).onDelete('cascade'),
])

// ---------------------------------------------------------------------------
// Cultos, postos e escalas
// ---------------------------------------------------------------------------

export const services = pgTable('services', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  startsAt: ts('starts_at').notNull(),
  endsAt: ts('ends_at').notNull(),
  // Data e mês no fuso da igreja, gravados na criação para consultas por mês.
  localDate: date('local_date').notNull(),
  month: text('month').notNull(),
  title: text('title').notNull(),
  location: text('location'),
  kind: text('kind').notNull().default('regular'), // regular | special | short
  status: text('status').notNull().default('scheduled'), // scheduled | cancelled
  notes: text('notes'),
  createdAt: createdAt(),
}, (t) => [
  unique('services_church_id_uq').on(t.churchId, t.id),
  index('services_church_month_idx').on(t.churchId, t.month),
  index('services_church_starts_idx').on(t.churchId, t.startsAt),
  check('services_month', sql`${t.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
  check('services_ends_after_start', sql`${t.endsAt} > ${t.startsAt}`),
])

export const slots = pgTable('slots', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  serviceId: uuid('service_id').notNull(),
  dutyId: uuid('duty_id').notNull(),
  position: integer('position').notNull().default(0),
  requiredCount: integer('required_count').notNull().default(1),
  // Sobrescrevem o horário de chegada da função e a janela usada no alerta de choque.
  arrivalAt: ts('arrival_at'),
  startsAt: ts('starts_at'),
  endsAt: ts('ends_at'),
  note: text('note'),
  createdAt: createdAt(),
}, (t) => [
  unique('slots_church_id_uq').on(t.churchId, t.id),
  index('slots_service_idx').on(t.serviceId),
  foreignKey({ columns: [t.churchId, t.serviceId], foreignColumns: [services.churchId, services.id] }).onDelete('cascade'),
  foreignKey({ columns: [t.churchId, t.dutyId], foreignColumns: [duties.churchId, duties.id] }),
  check('slots_required_count', sql`${t.requiredCount} between 1 and 50`),
])

export const scheduleMonths = pgTable('schedule_months', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  month: text('month').notNull(),
  status: text('status').notNull().default('draft'), // draft | published
  version: integer('version').notNull().default(0),
  publishedAt: ts('published_at'),
  publishedByAccountId: uuid('published_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [
  unique('schedule_months_uq').on(t.churchId, t.month),
  unique('schedule_months_church_id_uq').on(t.churchId, t.id),
])

export const schedulePublications = pgTable('schedule_publications', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  scheduleMonthId: uuid('schedule_month_id').notNull(),
  version: integer('version').notNull(),
  kind: text('kind').notNull(), // publish | change | swap | exception | response
  publishedByAccountId: uuid('published_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  notifyNow: boolean('notify_now').notNull().default(false),
  justification: text('justification'),
  alerts: jsonb('alerts').$type<unknown[]>().notNull().default([]),
  snapshot: jsonb('snapshot').$type<unknown>().notNull(),
  createdAt: createdAt(),
}, (t) => [
  unique('schedule_publications_uq').on(t.scheduleMonthId, t.version),
  foreignKey({ columns: [t.churchId, t.scheduleMonthId], foreignColumns: [scheduleMonths.churchId, scheduleMonths.id] }).onDelete('cascade'),
])

export const assignments = pgTable('assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  slotId: uuid('slot_id').notNull(),
  personId: uuid('person_id').notNull(),
  status: text('status').notNull().default('pending'), // pending | confirmed | declined
  statusChangedAt: ts('status_changed_at'),
  // Designação excepcional (pessoa sem habilitação), com motivo e autor registrados.
  exceptional: boolean('exceptional').notNull().default(false),
  exceptionReason: text('exception_reason'),
  exceptionByAccountId: uuid('exception_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  rowVersion: integer('row_version').notNull().default(1),
  createdByAccountId: uuid('created_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [
  unique('assignments_church_id_uq').on(t.churchId, t.id),
  unique('assignments_slot_person_uq').on(t.slotId, t.personId),
  index('assignments_person_idx').on(t.churchId, t.personId),
  foreignKey({ columns: [t.churchId, t.slotId], foreignColumns: [slots.churchId, slots.id] }).onDelete('cascade'),
  foreignKey({ columns: [t.churchId, t.personId], foreignColumns: [people.churchId, people.id] }),
])

export const assignmentResponses = pgTable('assignment_responses', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  assignmentId: uuid('assignment_id').notNull(),
  personId: uuid('person_id').notNull(),
  decision: text('decision').notNull(), // confirmed | declined
  channel: text('channel').notNull(), // app | coordination | whatsapp
  note: text('note'),
  recordedByAccountId: uuid('recorded_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  scheduleVersion: integer('schedule_version').notNull(),
  createdAt: createdAt(),
}, (t) => [
  index('assignment_responses_assignment_idx').on(t.assignmentId),
  foreignKey({ columns: [t.churchId, t.assignmentId], foreignColumns: [assignments.churchId, assignments.id] }).onDelete('cascade'),
  foreignKey({ columns: [t.churchId, t.personId], foreignColumns: [people.churchId, people.id] }),
])

export const swapRequests = pgTable('swap_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  assignmentId: uuid('assignment_id').notNull(),
  fromPersonId: uuid('from_person_id').notNull(),
  candidatePersonId: uuid('candidate_person_id').notNull(),
  // proposed | accepted | rejected | cancelled | superseded
  status: text('status').notNull().default('proposed'),
  message: text('message'),
  createdAt: createdAt(),
  respondedAt: ts('responded_at'),
}, (t) => [
  unique('swap_requests_church_id_uq').on(t.churchId, t.id),
  uniqueIndex('swap_requests_open_uq').on(t.assignmentId, t.candidatePersonId).where(sql`${t.status} = 'proposed'`),
  foreignKey({ columns: [t.churchId, t.assignmentId], foreignColumns: [assignments.churchId, assignments.id] }).onDelete('cascade'),
  foreignKey({ columns: [t.churchId, t.fromPersonId], foreignColumns: [people.churchId, people.id] }),
  foreignKey({ columns: [t.churchId, t.candidatePersonId], foreignColumns: [people.churchId, people.id] }),
])

// ---------------------------------------------------------------------------
// Coleta mensal de indisponibilidades
// ---------------------------------------------------------------------------

export const availabilityRequests = pgTable('availability_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  month: text('month').notNull(),
  sendAt: ts('send_at').notNull(),
  deadlineAt: ts('deadline_at').notNull(),
  status: text('status').notNull().default('scheduled'), // scheduled | sent | cancelled
  sentAt: ts('sent_at'),
  createdByAccountId: uuid('created_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [
  unique('availability_requests_uq').on(t.churchId, t.month),
  unique('availability_requests_church_id_uq').on(t.churchId, t.id),
  check('availability_requests_deadline', sql`${t.deadlineAt} > ${t.sendAt}`),
])

export const availabilityResponses = pgTable('availability_responses', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  requestId: uuid('request_id').notNull(),
  personId: uuid('person_id').notNull(),
  source: text('source').notNull(), // app | coordination
  note: text('note'),
  recordedByAccountId: uuid('recorded_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  submittedAt: ts('submitted_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [
  unique('availability_responses_uq').on(t.requestId, t.personId),
  foreignKey({ columns: [t.churchId, t.requestId], foreignColumns: [availabilityRequests.churchId, availabilityRequests.id] }).onDelete('cascade'),
  foreignKey({ columns: [t.churchId, t.personId], foreignColumns: [people.churchId, people.id] }).onDelete('cascade'),
])

export const unavailabilities = pgTable('unavailabilities', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  personId: uuid('person_id').notNull(),
  serviceId: uuid('service_id').notNull(),
  source: text('source').notNull(),
  recordedByAccountId: uuid('recorded_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [
  unique('unavailabilities_uq').on(t.personId, t.serviceId),
  index('unavailabilities_service_idx').on(t.serviceId),
  foreignKey({ columns: [t.churchId, t.personId], foreignColumns: [people.churchId, people.id] }).onDelete('cascade'),
  foreignKey({ columns: [t.churchId, t.serviceId], foreignColumns: [services.churchId, services.id] }).onDelete('cascade'),
])

// ---------------------------------------------------------------------------
// Mensagens (WhatsApp)
// ---------------------------------------------------------------------------

export const whatsappChannels = pgTable('whatsapp_channels', {
  churchId: uuid('church_id').primaryKey().references(() => churches.id, { onDelete: 'cascade' }),
  // disabled | simulation | cloud_api | ycloud
  mode: text('mode').notNull().default('disabled'),
  phoneNumberId: text('phone_number_id'),
  // Número remetente em E.164 (usado pelo YCloud, que identifica o canal pelo número).
  senderPhone: text('sender_phone'),
  businessAccountId: text('business_account_id'),
  displayPhoneLast4: text('display_phone_last4'),
  // Cloud API: token de acesso e app secret. YCloud: chave de API e segredo do webhook.
  accessTokenEnc: text('access_token_enc'),
  appSecretEnc: text('app_secret_enc'),
  webhookVerifyTokenHash: text('webhook_verify_token_hash'),
  // Coexistência com o aplicativo WhatsApp Business: sem comprovação, não há envio real.
  coexistenceStatus: text('coexistence_status').notNull().default('not_verified'),
  coexistenceNote: text('coexistence_note'),
  coexistenceVerifiedAt: ts('coexistence_verified_at'),
  // Último webhook com assinatura válida: mostra que o endereço está respondendo.
  lastWebhookAt: ts('last_webhook_at'),
  coexistenceVerifiedByAccountId: uuid('coexistence_verified_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  // Em modo de teste só números da lista recebem mensagens reais.
  testMode: boolean('test_mode').notNull().default(true),
  testRecipients: text('test_recipients').array().notNull().default(sql`ARRAY[]::text[]`),
  // Modelos aprovados na Meta por tipo de mensagem: { kind: { name, language, status } }.
  templates: jsonb('templates').$type<Record<string, { name: string, language: string, status: string }>>().notNull().default({}),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [
  // Os webhooks acham a igreja pelo número: cada número pertence a um só canal.
  uniqueIndex('whatsapp_channels_phone_number_id_uq').on(t.phoneNumberId).where(sql`${t.phoneNumberId} is not null`),
  uniqueIndex('whatsapp_channels_sender_phone_uq').on(t.senderPhone).where(sql`${t.senderPhone} is not null`),
])

export const outboundMessages = pgTable('outbound_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  idempotencyKey: text('idempotency_key').notNull(),
  kind: text('kind').notNull(),
  personId: uuid('person_id'),
  toPhone: text('to_phone'),
  params: jsonb('params').$type<string[]>().notNull().default([]),
  // Parâmetros com segredo (link de convite) ficam cifrados e são apagados após o envio.
  secretParamsEnc: text('secret_params_enc'),
  preview: text('preview').notNull(),
  // blocked | queued | sending | sent | delivered | read | failed | simulated | unknown | cancelled
  status: text('status').notNull(),
  blockedReason: text('blocked_reason'),
  provider: text('provider'),
  providerMessageId: text('provider_message_id'),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: ts('next_attempt_at'),
  lastError: text('last_error'),
  createdAt: createdAt(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  sentAt: ts('sent_at'),
  deliveredAt: ts('delivered_at'),
  readAt: ts('read_at'),
}, (t) => [
  unique('outbound_messages_idem_uq').on(t.churchId, t.idempotencyKey),
  unique('outbound_messages_church_id_uq').on(t.churchId, t.id),
  index('outbound_messages_queue_idx').on(t.status, t.nextAttemptAt),
  uniqueIndex('outbound_messages_provider_id_uq').on(t.providerMessageId).where(sql`${t.providerMessageId} is not null`),
  foreignKey({ columns: [t.churchId, t.personId], foreignColumns: [people.churchId, people.id] }),
])

export const messageEvents = pgTable('message_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  messageId: uuid('message_id'),
  eventKey: text('event_key').notNull(),
  type: text('type').notNull(), // status | inbound | action
  status: text('status'),
  detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
  occurredAt: ts('occurred_at').notNull(),
  createdAt: createdAt(),
}, (t) => [
  unique('message_events_uq').on(t.churchId, t.eventKey),
  index('message_events_message_idx').on(t.messageId),
])

export const reminderRuns = pgTable('reminder_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  scheduledFor: ts('scheduled_for').notNull(),
  windowStart: ts('window_start').notNull(),
  windowEnd: ts('window_end').notNull(),
  trigger: text('trigger').notNull().default('schedule'), // schedule | manual
  status: text('status').notNull().default('running'), // running | done
  stats: jsonb('stats').$type<Record<string, number>>().notNull().default({}),
  createdAt: createdAt(),
  finishedAt: ts('finished_at'),
}, (t) => [
  unique('reminder_runs_uq').on(t.churchId, t.scheduledFor),
  unique('reminder_runs_church_id_uq').on(t.churchId, t.id),
])

export const reminderDeliveries = pgTable('reminder_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  runId: uuid('run_id').notNull(),
  personId: uuid('person_id').notNull(),
  seq: integer('seq').notNull(),
  kind: text('kind').notNull(), // reminder | correction
  items: jsonb('items').$type<unknown[]>().notNull(),
  itemsHash: text('items_hash').notNull(),
  messageId: uuid('message_id'),
  createdAt: createdAt(),
}, (t) => [
  unique('reminder_deliveries_seq_uq').on(t.runId, t.personId, t.seq),
  foreignKey({ columns: [t.churchId, t.runId], foreignColumns: [reminderRuns.churchId, reminderRuns.id] }).onDelete('cascade'),
  foreignKey({ columns: [t.churchId, t.personId], foreignColumns: [people.churchId, people.id] }).onDelete('cascade'),
])

// ---------------------------------------------------------------------------
// Liturgia: modelos, roteiros, repertório e dados do Estêvão
// ---------------------------------------------------------------------------

export const liturgyTemplates = pgTable('liturgy_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('regular'), // regular | special | short
  description: text('description'),
  archived: boolean('archived').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [
  unique('liturgy_templates_church_id_uq').on(t.churchId, t.id),
])

export const templateBlocks = pgTable('template_blocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  templateId: uuid('template_id').notNull(),
  position: integer('position').notNull(),
  // heading | rite | reading | collect | psalm | sermon | music | announcements | text
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  // Origem do texto, para controle de direitos: church | loc_manual | other
  textSource: text('text_source').notNull().default('church'),
  dutyId: uuid('duty_id'),
  createdAt: createdAt(),
}, (t) => [
  index('template_blocks_template_idx').on(t.templateId),
  foreignKey({ columns: [t.churchId, t.templateId], foreignColumns: [liturgyTemplates.churchId, liturgyTemplates.id] }).onDelete('cascade'),
  foreignKey({ columns: [t.churchId, t.dutyId], foreignColumns: [duties.churchId, duties.id] }),
])

export const liturgicalSnapshots = pgTable('liturgical_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  prayerBook: text('prayer_book').notNull(),
  source: text('source').notNull(), // estevao | manual
  requestPath: text('request_path'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  fetchedAt: ts('fetched_at').notNull().defaultNow(),
}, (t) => [
  unique('liturgical_snapshots_church_id_uq').on(t.churchId, t.id),
  index('liturgical_snapshots_date_idx').on(t.churchId, t.date),
])

export const serviceScripts = pgTable('service_scripts', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  serviceId: uuid('service_id').notNull(),
  templateId: uuid('template_id'),
  status: text('status').notNull().default('draft'), // draft | published
  version: integer('version').notNull().default(0),
  title: text('title').notNull(),
  liturgicalSnapshotId: uuid('liturgical_snapshot_id'),
  // Dados litúrgicos escolhidos (cor, celebração, coleta) — editáveis manualmente.
  liturgy: jsonb('liturgy').$type<Record<string, unknown>>().notNull().default({}),
  pastoralNote: text('pastoral_note'),
  // Quem escolhe as músicas neste culto: preacher | pastors
  musicChooser: text('music_chooser').notNull().default('preacher'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  publishedAt: ts('published_at'),
  publishedByAccountId: uuid('published_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [
  unique('service_scripts_service_uq').on(t.churchId, t.serviceId),
  unique('service_scripts_church_id_uq').on(t.churchId, t.id),
  foreignKey({ columns: [t.churchId, t.serviceId], foreignColumns: [services.churchId, services.id] }).onDelete('cascade'),
  foreignKey({ columns: [t.churchId, t.templateId], foreignColumns: [liturgyTemplates.churchId, liturgyTemplates.id] }),
  foreignKey({ columns: [t.churchId, t.liturgicalSnapshotId], foreignColumns: [liturgicalSnapshots.churchId, liturgicalSnapshots.id] }),
])

export interface ScriptBlockData {
  reference?: string
  alternatives?: string[]
  readingText?: string
  source?: 'estevao' | 'manual'
  // Posição da leitura no lecionário: first_reading | psalm | second_reading | gospel.
  slot?: string
  songIds?: string[]
  // Avisos: "fixed" volta automaticamente nos próximos roteiros (todo domingo).
  items?: { text: string, ownerPersonId?: string | null, status?: 'draft' | 'ready', fixed?: boolean }[]
  // Texto do modelo no momento da criação, para "voltar ao padrão" num rito adaptado.
  templateBody?: string | null
}

export const scriptBlocks = pgTable('script_blocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  scriptId: uuid('script_id').notNull(),
  position: integer('position').notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  textSource: text('text_source').notNull().default('church'),
  // Responsável: pelo posto da escala (dutyId) ou pessoa definida no bloco.
  dutyId: uuid('duty_id'),
  personId: uuid('person_id'),
  data: jsonb('data').$type<ScriptBlockData>().notNull().default({}),
  createdAt: createdAt(),
}, (t) => [
  index('script_blocks_script_idx').on(t.scriptId),
  foreignKey({ columns: [t.churchId, t.scriptId], foreignColumns: [serviceScripts.churchId, serviceScripts.id] }).onDelete('cascade'),
  foreignKey({ columns: [t.churchId, t.dutyId], foreignColumns: [duties.churchId, duties.id] }),
  foreignKey({ columns: [t.churchId, t.personId], foreignColumns: [people.churchId, people.id] }),
])

export const scriptVersions = pgTable('script_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  scriptId: uuid('script_id').notNull(),
  version: integer('version').notNull(),
  content: jsonb('content').$type<Record<string, unknown>>().notNull(),
  publishedByAccountId: uuid('published_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [
  unique('script_versions_uq').on(t.scriptId, t.version),
  foreignKey({ columns: [t.churchId, t.scriptId], foreignColumns: [serviceScripts.churchId, serviceScripts.id] }).onDelete('cascade'),
])

export const songs = pgTable('songs', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  author: text('author'),
  musicalKey: text('musical_key'),
  link: text('link'),
  notes: text('notes'),
  createdAt: createdAt(),
}, (t) => [
  unique('songs_church_id_uq').on(t.churchId, t.id),
])

// ---------------------------------------------------------------------------
// Auditoria e importação
// ---------------------------------------------------------------------------

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').references(() => churches.id, { onDelete: 'cascade' }),
  actorAccountId: uuid('actor_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  reason: text('reason'),
  createdAt: createdAt(),
}, (t) => [
  index('audit_log_church_idx').on(t.churchId, t.createdAt),
  index('audit_log_entity_idx').on(t.entityType, t.entityId),
])

export const importBatches = pgTable('import_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  sourceKey: text('source_key').notNull(),
  month: text('month').notNull(),
  summary: jsonb('summary').$type<Record<string, unknown>>().notNull().default({}),
  createdByAccountId: uuid('created_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [
  unique('import_batches_uq').on(t.churchId, t.sourceKey),
])
