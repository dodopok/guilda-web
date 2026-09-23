import { z } from 'zod'
import { requestPasswordReset } from '../../../services/auth'

const schema = z.object({ login: z.string().trim().min(3).max(120) })

export default defineApiHandler(async (event) => {
  rateLimit(event, 'password-reset', 5, 15 * 60_000)
  const input = await body(event, schema)
  await requestPasswordReset(db(), input.login)
  // Resposta idêntica exista ou não a conta.
  return { ok: true, message: 'Se houver uma conta com este telefone e consentimento para mensagens, enviaremos um código pelo WhatsApp.' }
})
