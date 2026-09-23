import { and, eq, gt, isNull, ne, sql } from 'drizzle-orm'
import { getConfig } from '../config'
import type { Db, DbOrTx } from '../db/client'
import { accounts, authTokens, churchLogos, churches, consents, people, sessions } from '../db/schema'
import { burnPasswordCheck, hashPassword, randomToken, sha256, verifyPassword } from '../lib/crypto'
import { AppError, badRequest, notFound, unauthorized } from '../lib/errors'
import { normalizePhone } from '../lib/phone'
import { firstName } from '../lib/text'
import { audit } from './audit'
import { type ChurchContext, requireCoordinator } from './context'
import { enqueueMessage } from './messaging/outbox'

export type Account = typeof accounts.$inferSelect

const INVITE_TTL_HOURS = 72
const RESET_TTL_MINUTES = 30
const MAX_FAILED_LOGINS = 8
const LOCK_MINUTES = 15

export function normalizeLogin(login: string): string {
  const trimmed = login.trim()
  if (trimmed.includes('@')) return trimmed.toLowerCase()
  return normalizePhone(trimmed) ?? trimmed.toLowerCase()
}

export function validatePassword(password: string, login?: string) {
  if (password.length < 10) throw badRequest('weak_password', 'A senha precisa ter pelo menos 10 caracteres.')
  if (password.length > 200) throw badRequest('weak_password', 'A senha é longa demais.')
  const digits = login?.replace(/\D/g, '')
  if (digits && password.replace(/\D/g, '') === digits && digits.length > 0) {
    throw badRequest('weak_password', 'A senha não pode ser o seu telefone.')
  }
  if (/^(.)\1+$/.test(password)) throw badRequest('weak_password', 'Escolha uma senha menos previsível.')
}

// ---------------------------------------------------------------------------
// Sessões
// ---------------------------------------------------------------------------

export async function createSession(db: DbOrTx, accountId: string, client: 'web' | 'native', userAgent?: string | null) {
  const token = randomToken(32)
  const ttl = getConfig().sessionTtlDays
  const expiresAt = new Date(Date.now() + ttl * 86400_000)
  await db.insert(sessions).values({
    tokenHash: sha256(token),
    accountId,
    client,
    userAgent: userAgent?.slice(0, 200) ?? null,
    expiresAt,
  })
  return { token, expiresAt }
}

export async function getSession(db: Db, token: string) {
  const row = await db.select({ session: sessions, account: accounts }).from(sessions)
    .innerJoin(accounts, eq(accounts.id, sessions.accountId))
    .where(and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .limit(1)
  const found = row[0]
  if (!found || found.account.status !== 'active') return null
  // Atualiza o último uso no máximo a cada 5 minutos.
  if (Date.now() - found.session.lastUsedAt.getTime() > 5 * 60_000) {
    await db.update(sessions).set({ lastUsedAt: new Date() }).where(eq(sessions.id, found.session.id))
  }
  return found
}

export async function revokeSession(db: Db, token: string) {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, sha256(token)))
}

export async function revokeAllSessions(db: DbOrTx, accountId: string, exceptTokenHash?: string) {
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(
    eq(sessions.accountId, accountId),
    isNull(sessions.revokedAt),
    exceptTokenHash ? ne(sessions.tokenHash, exceptTokenHash) : undefined,
  ))
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export async function login(db: Db, input: { login: string, password: string, client: 'web' | 'native', userAgent?: string | null }) {
  const loginKey = normalizeLogin(input.login)
  const account = await db.query.accounts.findFirst({ where: eq(accounts.login, loginKey) })
  const invalid = new AppError(401, 'invalid_credentials', 'Telefone ou senha incorretos.')
  if (!account || !account.passwordHash || account.status !== 'active') {
    await burnPasswordCheck(input.password)
    throw invalid
  }
  if (account.lockedUntil && account.lockedUntil > new Date()) {
    throw new AppError(429, 'account_locked', 'Muitas tentativas. Aguarde alguns minutos e tente de novo.')
  }
  const ok = await verifyPassword(input.password, account.passwordHash)
  if (!ok) {
    const failed = account.failedLoginCount + 1
    await db.update(accounts).set({
      failedLoginCount: failed >= MAX_FAILED_LOGINS ? 0 : failed,
      lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : account.lockedUntil,
    }).where(eq(accounts.id, account.id))
    throw invalid
  }
  await db.update(accounts).set({ failedLoginCount: 0, lockedUntil: null }).where(eq(accounts.id, account.id))
  const session = await createSession(db, account.id, input.client, input.userAgent)
  return { account, ...session }
}

export async function changePassword(db: Db, accountId: string, current: string, next: string, currentTokenHash?: string) {
  const account = await db.query.accounts.findFirst({ where: eq(accounts.id, accountId) })
  if (!account || !(await verifyPassword(current, account.passwordHash))) {
    throw new AppError(400, 'invalid_credentials', 'A senha atual não confere.')
  }
  validatePassword(next, account.login)
  await db.update(accounts).set({ passwordHash: await hashPassword(next), passwordChangedAt: new Date() }).where(eq(accounts.id, accountId))
  await revokeAllSessions(db, accountId, currentTokenHash)
}

// Igrejas às quais a conta tem acesso ativo, com os papéis em cada uma.
export async function listMemberships(db: DbOrTx, accountId: string) {
  return db.select({
    churchId: churches.id,
    slug: churches.slug,
    name: churches.name,
    timezone: churches.timezone,
    personId: people.id,
    displayName: people.displayName,
    roles: people.roles,
  }).from(people)
    .innerJoin(churches, eq(churches.id, people.churchId))
    .where(and(eq(people.accountId, accountId), eq(people.status, 'active'), eq(churches.status, 'active')))
    .orderBy(churches.name)
}

// ---------------------------------------------------------------------------
// Convites
// ---------------------------------------------------------------------------

function inviteLink(token: string) {
  return `${getConfig().appBaseUrl}/convite/${token}`
}

// Cria um convite individual de uso único e o coloca na fila do WhatsApp.
// Convites anteriores ainda não usados da mesma pessoa são revogados.
export async function createInvite(db: Db, ctx: ChurchContext, personId: string) {
  requireCoordinator(ctx)
  return db.transaction(async (tx) => {
    const person = await tx.query.people.findFirst({ where: and(eq(people.churchId, ctx.church.id), eq(people.id, personId)) })
    if (!person) throw notFound('Pessoa')
    if (person.status !== 'active') throw badRequest('person_inactive', 'Pessoa inativa não recebe convite.')
    if (!person.phoneE164) throw badRequest('no_phone', 'Cadastre o telefone antes de enviar o convite.')
    if (person.accountId) throw badRequest('already_member', 'Esta pessoa já tem acesso. Use "Reenviar acesso" para redefinir a senha.')

    await tx.update(authTokens).set({ revokedAt: new Date() }).where(and(
      eq(authTokens.purpose, 'invite'), eq(authTokens.churchId, ctx.church.id), eq(authTokens.personId, personId),
      isNull(authTokens.usedAt), isNull(authTokens.revokedAt),
    ))
    const token = randomToken(32)
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600_000)
    const [row] = await tx.insert(authTokens).values({
      purpose: 'invite',
      tokenHash: sha256(token),
      churchId: ctx.church.id,
      personId,
      createdByAccountId: ctx.accountId,
      expiresAt,
    }).returning()
    const message = await enqueueMessage(tx, {
      churchId: ctx.church.id,
      personId,
      kind: 'invite',
      idempotencyKey: `invite:${row!.id}`,
      params: [firstName(person.displayName), ctx.church.name, inviteLink(token)],
    })
    await audit(tx, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'invite.created', entityType: 'person', entityId: personId })
    return { inviteId: row!.id, expiresAt, messageId: message.id, messageStatus: message.status, blockedReason: message.blockedReason }
  })
}

async function findValidToken(db: DbOrTx, token: string, purpose: 'invite' | 'password_reset', forUpdate = false) {
  const q = db.select().from(authTokens).where(and(
    eq(authTokens.tokenHash, sha256(token)),
    eq(authTokens.purpose, purpose),
  )).limit(1)
  const rows = forUpdate ? await q.for('update') : await q
  const row = rows[0]
  if (!row || row.usedAt || row.revokedAt || row.expiresAt <= new Date()) {
    throw new AppError(410, 'token_invalid', 'Este link expirou ou já foi usado. Peça um novo à coordenação.')
  }
  return row
}

// Informações mínimas para a tela do convite: só o nome da igreja e o primeiro nome
// do próprio destinatário.
// Igreja do convite (para o logo na tela de criação de senha).
export async function inviteChurchId(db: Db, token: string): Promise<string> {
  const row = await findValidToken(db, token, 'invite')
  return row.churchId!
}

export async function describeInvite(db: Db, token: string) {
  const row = await findValidToken(db, token, 'invite')
  const person = await db.query.people.findFirst({ where: and(eq(people.churchId, row.churchId!), eq(people.id, row.personId!)) })
  const church = await db.query.churches.findFirst({ where: eq(churches.id, row.churchId!) })
  if (!person || !church || person.status !== 'active') throw new AppError(410, 'token_invalid', 'Este convite não é mais válido.')
  const existing = person.phoneE164 ? await db.query.accounts.findFirst({ where: eq(accounts.login, person.phoneE164) }) : null
  return {
    churchName: church.name,
    timezone: church.timezone,
    accentColor: church.accentColor,
    hasLogo: Boolean(await db.query.churchLogos.findFirst({ where: eq(churchLogos.churchId, church.id), columns: { churchId: true } })),
    firstName: firstName(person.displayName),
    expiresAt: row.expiresAt,
    accountExists: Boolean(existing),
  }
}

// Aceita o convite. Se já existe conta para o telefone (a pessoa participa de outra
// igreja), exige a senha dessa conta para vincular; caso contrário cria a conta.
export async function acceptInvite(db: Db, input: { token: string, password: string, client: 'web' | 'native', userAgent?: string | null }) {
  const result = await db.transaction(async (tx) => {
    const row = await findValidToken(tx, input.token, 'invite', true)
    const person = await tx.query.people.findFirst({ where: and(eq(people.churchId, row.churchId!), eq(people.id, row.personId!)) })
    if (!person || person.status !== 'active' || !person.phoneE164) throw new AppError(410, 'token_invalid', 'Este convite não é mais válido.')
    if (person.accountId) throw new AppError(410, 'token_invalid', 'Este convite já foi usado.')

    let account = await tx.query.accounts.findFirst({ where: eq(accounts.login, person.phoneE164) })
    if (account) {
      if (!(await verifyPassword(input.password, account.passwordHash))) {
        throw new AppError(401, 'invalid_credentials', 'Você já tem conta na Guilda. Digite a senha dessa conta para vincular esta igreja.')
      }
    } else {
      validatePassword(input.password, person.phoneE164)
      const [created] = await tx.insert(accounts).values({
        login: person.phoneE164,
        passwordHash: await hashPassword(input.password),
        displayName: person.displayName,
        passwordChangedAt: new Date(),
      }).returning()
      account = created!
    }
    await tx.update(people).set({ accountId: account.id }).where(and(eq(people.churchId, person.churchId), eq(people.id, person.id)))
    await tx.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id))
    await audit(tx, { churchId: person.churchId, actorAccountId: account.id, action: 'invite.accepted', entityType: 'person', entityId: person.id })
    const session = await createSession(tx, account.id, input.client, input.userAgent)
    const church = await tx.query.churches.findFirst({ where: eq(churches.id, person.churchId) })
    return { account, churchSlug: church!.slug, ...session }
  })
  return result
}

// ---------------------------------------------------------------------------
// Recuperação de acesso
// ---------------------------------------------------------------------------

// Pedido feito pela própria pessoa. A resposta é sempre a mesma, exista ou não a conta.
export async function requestPasswordReset(db: Db, loginInput: string) {
  const loginKey = normalizeLogin(loginInput)
  const account = await db.query.accounts.findFirst({ where: eq(accounts.login, loginKey) })
  if (!account || account.status !== 'active') return
  // Envia pela igreja em que a pessoa tem consentimento e telefone igual ao login.
  const membership = await db.select({ person: people, church: churches }).from(people)
    .innerJoin(churches, eq(churches.id, people.churchId))
    .innerJoin(consents, and(eq(consents.churchId, people.churchId), eq(consents.personId, people.id), eq(consents.status, 'granted')))
    .where(and(eq(people.accountId, account.id), eq(people.status, 'active'), eq(people.phoneE164, account.login)))
    .limit(1)
  const target = membership[0]
  if (!target) return
  // No máximo um pedido a cada 5 minutos por conta.
  const recent = await db.select({ n: sql<number>`count(*)::int` }).from(authTokens).where(and(
    eq(authTokens.accountId, account.id), eq(authTokens.purpose, 'password_reset'),
    gt(authTokens.createdAt, new Date(Date.now() - 5 * 60_000)),
  ))
  if ((recent[0]?.n ?? 0) > 0) return
  await issuePasswordReset(db, account, target.person, target.church, null)
}

// A coordenação pode reenviar o acesso de quem já tem conta.
export async function coordinatorResendAccess(db: Db, ctx: ChurchContext, personId: string) {
  requireCoordinator(ctx)
  const person = await db.query.people.findFirst({ where: and(eq(people.churchId, ctx.church.id), eq(people.id, personId)) })
  if (!person) throw notFound('Pessoa')
  if (!person.accountId) return createInvite(db, ctx, personId)
  const account = await db.query.accounts.findFirst({ where: eq(accounts.id, person.accountId) })
  if (!account) throw notFound('Conta')
  const result = await issuePasswordReset(db, account, person, ctx.church, ctx.accountId)
  return { inviteId: null, ...result }
}

async function issuePasswordReset(db: Db, account: Account, person: typeof people.$inferSelect, church: typeof churches.$inferSelect, createdBy: string | null) {
  return db.transaction(async (tx) => {
    await tx.update(authTokens).set({ revokedAt: new Date() }).where(and(
      eq(authTokens.accountId, account.id), eq(authTokens.purpose, 'password_reset'), isNull(authTokens.usedAt), isNull(authTokens.revokedAt),
    ))
    const token = randomToken(32)
    const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60_000)
    const [row] = await tx.insert(authTokens).values({
      purpose: 'password_reset',
      tokenHash: sha256(token),
      accountId: account.id,
      churchId: church.id,
      personId: person.id,
      createdByAccountId: createdBy,
      expiresAt,
    }).returning()
    const message = await enqueueMessage(tx, {
      churchId: church.id,
      personId: person.id,
      kind: 'password_reset',
      idempotencyKey: `reset:${row!.id}`,
      params: [firstName(person.displayName), church.name, `${getConfig().appBaseUrl}/redefinir-senha/${token}`],
    })
    await audit(tx, { churchId: church.id, actorAccountId: createdBy, action: 'password_reset.issued', entityType: 'account', entityId: account.id })
    return { expiresAt, messageId: message.id, messageStatus: message.status, blockedReason: message.blockedReason }
  })
}

export async function resetPassword(db: Db, token: string, password: string) {
  await db.transaction(async (tx) => {
    const row = await findValidToken(tx, token, 'password_reset', true)
    const account = await tx.query.accounts.findFirst({ where: eq(accounts.id, row.accountId!) })
    if (!account) throw new AppError(410, 'token_invalid', 'Link inválido.')
    validatePassword(password, account.login)
    await tx.update(accounts).set({ passwordHash: await hashPassword(password), passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null })
      .where(eq(accounts.id, account.id))
    await tx.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id))
    await revokeAllSessions(tx, account.id)
    await audit(tx, { churchId: row.churchId, actorAccountId: account.id, action: 'password_reset.completed', entityType: 'account', entityId: account.id })
  })
}

export function assertAuthenticated<T>(value: T | null | undefined): T {
  if (!value) throw unauthorized()
  return value
}
