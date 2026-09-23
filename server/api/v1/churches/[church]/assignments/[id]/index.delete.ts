import { z } from 'zod'
import { removeAssignment } from '~~/server/services/schedule'

const schema = z.object({ reason: z.string().trim().max(500).nullable().optional(), notifyNow: z.boolean().default(false) })

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, schema)
  await removeAssignment(db(), ctx, param(event, 'id'), input)
  return { ok: true }
})
