import { z } from 'zod'
import { listAudit } from '~~/server/services/audit'

const schema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(100), entityId: z.string().optional() })

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return { entries: await listAudit(db(), ctx, query(event, schema)) }
})
