import type { DbOrTx } from '../db/client'
import { and, desc, eq } from 'drizzle-orm'
import { accounts, auditLog } from '../db/schema'
import { type ChurchContext, requireCoordinator } from './context'

export interface AuditEntry {
  churchId: string | null
  actorAccountId: string | null
  action: string
  entityType: string
  entityId?: string | null
  data?: Record<string, unknown>
  reason?: string | null
}

// Registro de quem fez o quê. Nunca incluir tokens, senhas ou telefones completos em data.
export async function audit(db: DbOrTx, entry: AuditEntry) {
  await db.insert(auditLog).values({
    churchId: entry.churchId,
    actorAccountId: entry.actorAccountId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    data: entry.data ?? {},
    reason: entry.reason ?? null,
  })
}

export async function listAudit(db: DbOrTx, ctx: ChurchContext, q: { limit: number, entityId?: string }) {
  requireCoordinator(ctx)
  return db.select({
    id: auditLog.id,
    action: auditLog.action,
    entityType: auditLog.entityType,
    entityId: auditLog.entityId,
    data: auditLog.data,
    reason: auditLog.reason,
    createdAt: auditLog.createdAt,
    actorName: accounts.displayName,
  }).from(auditLog)
    .leftJoin(accounts, eq(accounts.id, auditLog.actorAccountId))
    .where(and(eq(auditLog.churchId, ctx.church.id), q.entityId ? eq(auditLog.entityId, q.entityId) : undefined))
    .orderBy(desc(auditLog.createdAt))
    .limit(q.limit)
}
