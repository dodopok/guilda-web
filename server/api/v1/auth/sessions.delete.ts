import { revokeAllSessions } from '../../../services/auth'

// Encerra as sessões em outros aparelhos, mantendo a atual.
export default defineApiHandler(async (event) => {
  const auth = requireAuth(event)
  await revokeAllSessions(db(), auth.accountId, auth.tokenHash)
  return { ok: true }
})
