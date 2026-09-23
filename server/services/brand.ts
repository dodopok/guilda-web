import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db, DbOrTx } from '../db/client'
import { churchLogos } from '../db/schema'
import { badRequest } from '../lib/errors'
import { audit } from './audit'
import { type ChurchContext, requireCoordinator } from './context'

// Logo da igreja. O navegador reduz a imagem antes de enviar; o servidor aceita só
// PNG, JPEG ou WebP, conferidos pelos bytes iniciais (nunca SVG, que pode carregar script).
export const MAX_LOGO_BYTES = 300 * 1024

export const logoSchema = z.object({
  dataUrl: z.string().max(Math.ceil(MAX_LOGO_BYTES * 4 / 3) + 64),
})

const MAGIC: { mime: string, test: (b: Buffer) => boolean }[] = [
  { mime: 'image/png', test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) },
  { mime: 'image/jpeg', test: (b) => b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
  { mime: 'image/webp', test: (b) => b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
]

export function parseLogo(dataUrl: string): { mime: string, bytes: Buffer } {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!m) throw badRequest('invalid_logo', 'Envie uma imagem PNG, JPG ou WebP.')
  const bytes = Buffer.from(m[2]!, 'base64')
  if (!bytes.length || bytes.length > MAX_LOGO_BYTES) throw badRequest('invalid_logo', 'A imagem precisa ter no máximo 300 KB.')
  const detected = MAGIC.find((x) => x.test(bytes))
  if (!detected) throw badRequest('invalid_logo', 'O arquivo não parece ser uma imagem PNG, JPG ou WebP.')
  return { mime: detected.mime, bytes }
}

export async function setLogo(db: Db, ctx: ChurchContext, input: z.infer<typeof logoSchema>) {
  requireCoordinator(ctx)
  const { mime, bytes } = parseLogo(input.dataUrl)
  const now = new Date()
  await db.insert(churchLogos).values({ churchId: ctx.church.id, mime, dataBase64: bytes.toString('base64'), updatedAt: now })
    .onConflictDoUpdate({ target: churchLogos.churchId, set: { mime, dataBase64: bytes.toString('base64'), updatedAt: now } })
  await audit(db, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'church.logo_updated', entityType: 'church', entityId: ctx.church.id, data: { mime, bytes: bytes.length } })
  return { logoVersion: now.getTime() }
}

export async function removeLogo(db: Db, ctx: ChurchContext) {
  requireCoordinator(ctx)
  await db.delete(churchLogos).where(eq(churchLogos.churchId, ctx.church.id))
  await audit(db, { churchId: ctx.church.id, actorAccountId: ctx.accountId, action: 'church.logo_removed', entityType: 'church', entityId: ctx.church.id })
}

export async function getLogo(db: DbOrTx, churchId: string) {
  const row = await db.query.churchLogos.findFirst({ where: eq(churchLogos.churchId, churchId) })
  return row ? { mime: row.mime, bytes: Buffer.from(row.dataBase64, 'base64'), updatedAt: row.updatedAt } : null
}

export async function logoVersion(db: DbOrTx, churchId: string): Promise<number | null> {
  const row = await db.select({ updatedAt: churchLogos.updatedAt }).from(churchLogos).where(eq(churchLogos.churchId, churchId))
  return row[0]?.updatedAt.getTime() ?? null
}
