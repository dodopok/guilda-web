import { z } from 'zod'
import { verifyResetCode } from '../../../services/auth'

const schema = z.object({ login: z.string().trim().min(3).max(120), code: z.string().trim().min(4).max(12) })

// Troca o código recebido no WhatsApp por um token de uso único para criar a senha nova.
export default defineApiHandler(async (event) => {
  rateLimit(event, 'password-reset-verify', 20, 15 * 60_000)
  const input = await body(event, schema)
  return verifyResetCode(db(), input.login, input.code)
})
