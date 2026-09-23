import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db/client'
import { churches, duties, ministries } from '../db/schema'
import { nameKey } from '../lib/text'
import { audit } from './audit'
import { type ChurchContext, requireCoordinator } from './context'

// Catálogo sugerido na configuração inicial. Nomes genéricos de funções comuns em cultos;
// a coordenação escolhe o que existe na sua igreja e ajusta depois em "Pessoas e funções".
interface CatalogItem {
  key: string
  ministry: string
  name: string
  required: number
  arrival: number | null
  kind: 'general' | 'sermon' | 'reading' | 'presiding' | 'music'
  musicNotice?: boolean
  suggested: boolean
  instructions: string
}

export const DEFAULT_CATALOG: CatalogItem[] = [
  { key: 'abertura', ministry: 'Liturgia', name: 'Abertura', required: 1, arrival: 20, kind: 'presiding', suggested: true, instructions: 'Conduz a abertura e a coleta conforme o roteiro publicado.' },
  { key: 'confissao', ministry: 'Liturgia', name: 'Confissão', required: 1, arrival: 20, kind: 'general', suggested: true, instructions: 'Conduz a confissão conforme o roteiro.' },
  { key: 'leitura', ministry: 'Liturgia', name: 'Leitura', required: 2, arrival: 20, kind: 'reading', suggested: true, instructions: 'Lê a passagem indicada no roteiro. Confira a referência antes do culto.' },
  { key: 'ofertorio', ministry: 'Liturgia', name: 'Ofertório', required: 1, arrival: 20, kind: 'general', suggested: true, instructions: 'Conduz o momento do ofertório.' },
  { key: 'sermao', ministry: 'Liturgia', name: 'Sermão', required: 1, arrival: 30, kind: 'sermon', suggested: true, instructions: 'Prega e, normalmente, escolhe as músicas do culto no app.' },
  { key: 'eucaristia', ministry: 'Liturgia', name: 'Eucaristia', required: 1, arrival: 30, kind: 'presiding', suggested: true, instructions: 'Preside a eucaristia.' },
  { key: 'credo', ministry: 'Liturgia', name: 'Credo Apostólico', required: 1, arrival: 20, kind: 'general', suggested: true, instructions: 'Conduz o credo.' },
  { key: 'avisos', ministry: 'Liturgia', name: 'Avisos', required: 1, arrival: 20, kind: 'general', suggested: true, instructions: 'Lê os avisos organizados no roteiro.' },
  { key: 'bencao', ministry: 'Liturgia', name: 'Bênção / Envio', required: 1, arrival: 20, kind: 'presiding', suggested: true, instructions: 'Conduz a bênção e o envio.' },
  { key: 'louvor', ministry: 'Louvor', name: 'Louvor', required: 3, arrival: 60, kind: 'music', musicNotice: true, suggested: true, instructions: 'Ensaia e conduz as músicas escolhidas no app.' },
  { key: 'projecao', ministry: 'Mídia', name: 'Projeção', required: 1, arrival: 30, kind: 'general', suggested: true, instructions: 'Projeções na TV durante o culto.' },
  { key: 'som', ministry: 'Mídia', name: 'Som', required: 1, arrival: 30, kind: 'general', suggested: false, instructions: 'Liga e ajusta o som antes do culto.' },
  { key: 'redes', ministry: 'Mídias Sociais', name: 'Mídias Sociais', required: 1, arrival: null, kind: 'general', suggested: true, instructions: 'Fotos, vídeos e artes para as redes da igreja.' },
  { key: 'cafe', ministry: 'Café da Manhã', name: 'Café da Manhã', required: 1, arrival: 45, kind: 'general', suggested: true, instructions: 'Prepara café e chá, organiza a mesa, recolhe e lava ao final.' },
  { key: 'sodalicio', ministry: 'Sodalício', name: 'Sodalício', required: 1, arrival: 30, kind: 'general', suggested: true, instructions: 'Prepara a mesa da ceia, velas e panos.' },
  { key: 'servico', ministry: 'Serviço Dominical', name: 'Serviço Dominical', required: 1, arrival: 45, kind: 'general', suggested: true, instructions: 'Púlpito, água, apoio à ceia, salão e cadeiras.' },
  { key: 'limpeza', ministry: 'Limpeza', name: 'Limpeza', required: 1, arrival: null, kind: 'general', suggested: false, instructions: 'Organiza cadeiras e ajuda na limpeza depois do culto.' },
  { key: 'lojinha', ministry: 'Lojinha', name: 'Lojinha', required: 1, arrival: null, kind: 'general', suggested: true, instructions: 'Monta e guarda a lojinha e registra as saídas.' },
  { key: 'recepcao', ministry: 'Recepção', name: 'Recepção', required: 1, arrival: 20, kind: 'general', suggested: false, instructions: 'Recebe quem chega e ajuda visitantes a se acomodar.' },
  { key: 'criancas', ministry: 'Crianças', name: 'Crianças', required: 1, arrival: 20, kind: 'general', suggested: false, instructions: 'Acompanha as crianças durante o culto.' },
]

export async function setupState(db: Db, ctx: ChurchContext) {
  requireCoordinator(ctx)
  const existing = await db.select({ name: duties.name, active: duties.active }).from(duties).where(eq(duties.churchId, ctx.church.id))
  const keys = new Set(existing.filter((d) => d.active).map((d) => nameKey(d.name)))
  return {
    completed: Boolean(ctx.church.setupCompletedAt),
    hasDuties: existing.some((d) => d.active),
    catalog: DEFAULT_CATALOG.map((c) => ({ key: c.key, ministry: c.ministry, name: c.name, exists: keys.has(nameKey(c.name)), suggested: c.suggested })),
  }
}

export const setupDutiesSchema = z.object({ keys: z.array(z.string().max(40)).max(100) })

// Cria as funções escolhidas que ainda não existem (pelo nome). Nunca apaga nem desativa:
// o que já está cadastrado continua como está.
export async function applySetupDuties(db: Db, ctx: ChurchContext, input: z.infer<typeof setupDutiesSchema>) {
  requireCoordinator(ctx)
  const chosen = DEFAULT_CATALOG.filter((c) => input.keys.includes(c.key))
  return db.transaction(async (tx) => {
    const ms = await tx.select().from(ministries).where(eq(ministries.churchId, ctx.church.id))
    const ds = await tx.select({ name: duties.name }).from(duties).where(eq(duties.churchId, ctx.church.id))
    const existingDuties = new Set(ds.map((d) => nameKey(d.name)))
    const ministryIds = new Map(ms.map((m) => [nameKey(m.name), m.id]))
    let created = 0
    for (const [i, c] of chosen.entries()) {
      if (existingDuties.has(nameKey(c.name))) continue
      let ministryId = ministryIds.get(nameKey(c.ministry))
      if (!ministryId) {
        const [m] = await tx.insert(ministries).values({ churchId: ctx.church.id, name: c.ministry, position: ministryIds.size }).returning()
        ministryId = m!.id
        ministryIds.set(nameKey(c.ministry), ministryId)
      }
      await tx.insert(duties).values({
        churchId: ctx.church.id,
        ministryId,
        name: c.name,
        instructions: c.instructions,
        arrivalMinutesBefore: c.arrival,
        kind: c.kind,
        receivesMusicNotice: Boolean(c.musicNotice),
        defaultRequiredCount: c.required,
        includeByDefault: true,
        position: i,
      })
      created++
    }
    await audit(tx, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'setup.duties', entityType: 'church', entityId: ctx.church.id, data: { created } })
    return { created }
  })
}

export async function completeSetup(db: Db, ctx: ChurchContext) {
  requireCoordinator(ctx)
  await db.update(churches).set({ setupCompletedAt: sql`coalesce(${churches.setupCompletedAt}, now())` })
    .where(and(eq(churches.id, ctx.church.id)))
  await audit(db, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'setup.completed', entityType: 'church', entityId: ctx.church.id })
  return { completed: true }
}
