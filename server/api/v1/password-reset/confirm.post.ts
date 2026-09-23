import { z } from 'zod'
import { resetPassword } from '../../../services/auth'

const schema = z.object({ token: z.string().min(20).max(200), password: z.string().min(1).max(200), client: z.enum(['web', 'native']).default('web') })

export default defineApiHandler(async (event) => {
  rateLimit(event, 'password-reset-confirm', 20, 15 * 60_000)
  const input = await body(event, schema)
  const session = await resetPassword(db(), input.token, input.password, { client: input.client, userAgent: getHeader(event, 'user-agent') })
  return { ok: true, session: sessionResponse(event, input.client, session.token, session.expiresAt) }
})
