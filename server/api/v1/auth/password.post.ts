import { z } from 'zod'
import { changePassword } from '../../../services/auth'

const schema = z.object({ current: z.string().min(1).max(200), next: z.string().min(1).max(200) })

export default defineApiHandler(async (event) => {
  const auth = requireAuth(event)
  rateLimit(event, 'password-change', 10, 10 * 60_000)
  const input = await body(event, schema)
  await changePassword(db(), auth.accountId, input.current, input.next, auth.tokenHash)
  return { ok: true }
})
