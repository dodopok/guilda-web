import { z } from 'zod'
import { listMemberships, login } from '../../../services/auth'

const schema = z.object({
  login: z.string().trim().min(3).max(120),
  password: z.string().min(1).max(200),
  client: z.enum(['web', 'native']).default('web'),
})

export default defineApiHandler(async (event) => {
  rateLimit(event, 'login', 20, 10 * 60_000)
  const input = await body(event, schema)
  const result = await login(db(), { ...input, userAgent: getHeader(event, 'user-agent') })
  const session = sessionResponse(event, input.client, result.token, result.expiresAt)
  return {
    account: { id: result.account.id, displayName: result.account.displayName, isPlatformAdmin: result.account.isPlatformAdmin },
    memberships: await listMemberships(db(), result.account.id),
    session,
  }
})
