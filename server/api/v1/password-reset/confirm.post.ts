import { z } from 'zod'
import { resetPassword } from '../../../services/auth'

const schema = z.object({ token: z.string().min(20).max(200), password: z.string().min(1).max(200) })

export default defineApiHandler(async (event) => {
  rateLimit(event, 'password-reset-confirm', 20, 15 * 60_000)
  const input = await body(event, schema)
  await resetPassword(db(), input.token, input.password)
  return { ok: true }
})
