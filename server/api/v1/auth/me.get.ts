import { listMemberships } from '../../../services/auth'
import { maskPhone } from '../../../lib/phone'

export default defineApiHandler(async (event) => {
  const auth = requireAuth(event)
  return {
    account: {
      id: auth.accountId,
      displayName: auth.displayName,
      login: auth.login.startsWith('+') ? maskPhone(auth.login) : auth.login,
      isPlatformAdmin: auth.isPlatformAdmin,
    },
    memberships: await listMemberships(db(), auth.accountId),
  }
})
