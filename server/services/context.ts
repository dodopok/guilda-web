import { and, eq } from 'drizzle-orm'
import type { DbOrTx } from '../db/client'
import { churches, people } from '../db/schema'
import { forbidden, notFound } from '../lib/errors'

export type Role = 'coordinator' | 'pastor' | 'participant'
export const ROLES: Role[] = ['coordinator', 'pastor', 'participant']

export interface Actor {
  accountId: string
  isPlatformAdmin: boolean
}

export type ChurchRow = typeof churches.$inferSelect

// Contexto de toda operação dentro de uma igreja. Serviços recebem este objeto e
// sempre filtram por ctx.church.id; nenhum identificador vindo do cliente amplia o escopo.
export interface ChurchContext {
  church: ChurchRow
  accountId: string | null
  personId: string | null
  roles: Role[]
}

export function isCoordinator(ctx: ChurchContext) {
  return ctx.roles.includes('coordinator')
}

export function isPastor(ctx: ChurchContext) {
  return ctx.roles.includes('pastor')
}

export function requireCoordinator(ctx: ChurchContext) {
  if (!isCoordinator(ctx)) throw forbidden('Somente a coordenação pode fazer esta alteração.')
}

export function requirePerson(ctx: ChurchContext): string {
  if (!ctx.personId) throw forbidden()
  return ctx.personId
}

// Resolve a igreja pelo slug e o vínculo da conta. Sem vínculo ativo responde 404,
// para não revelar a existência de dados de outra comunidade.
export async function resolveChurchContext(db: DbOrTx, actor: Actor, slug: string): Promise<ChurchContext> {
  const church = await db.query.churches.findFirst({ where: eq(churches.slug, slug) })
  if (!church || church.status !== 'active') throw notFound('Igreja')
  const person = await db.query.people.findFirst({
    where: and(eq(people.churchId, church.id), eq(people.accountId, actor.accountId), eq(people.status, 'active')),
  })
  if (!person) throw notFound('Igreja')
  return { church, accountId: actor.accountId, personId: person.id, roles: person.roles as Role[] }
}

// Contexto usado pelo trabalhador (tarefas agendadas), sem conta humana.
export function systemContext(church: ChurchRow): ChurchContext {
  return { church, accountId: null, personId: null, roles: ['coordinator'] }
}
