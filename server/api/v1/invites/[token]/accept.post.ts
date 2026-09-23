import { z } from 'zod'
import { acceptInvite } from '../../../../services/auth'

const schema = z.object({ password: z.string().min(1).max(200), client: z.enum(['web', 'native']).default('web') })

export default defineApiHandler(async (event) => {
  rateLimit(event, 'invite-accept', 20, 15 * 60_000)
  const input = await body(event, schema)
  const result = await acceptInvite(db(), {
    token: getRouterParam(event, 'token') ?? '',
    password: input.password,
    client: input.client,
    userAgent: getHeader(event, 'user-agent'),
  })
  return { churchSlug: result.churchSlug, session: sessionResponse(event, input.client, result.token, result.expiresAt) }
})
