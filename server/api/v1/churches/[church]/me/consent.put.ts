import { z } from 'zod'
import { requirePerson } from '~~/server/services/context'
import { setConsent } from '~~/server/services/people'

const schema = z.object({ status: z.enum(['granted', 'revoked']) })

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, schema)
  await setConsent(db(), ctx, requirePerson(ctx), { status: input.status, source: 'app' })
  return { ok: true }
})
