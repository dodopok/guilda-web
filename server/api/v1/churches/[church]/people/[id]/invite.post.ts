import { coordinatorResendAccess } from '~~/server/services/auth'

// Convite individual (pessoa sem conta) ou reenvio de acesso (pessoa com conta).
export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return coordinatorResendAccess(db(), ctx, param(event, 'id'))
})
