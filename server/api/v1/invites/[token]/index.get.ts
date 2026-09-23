import { describeInvite } from '../../../../services/auth'

export default defineApiHandler(async (event) => {
  rateLimit(event, 'invite', 30, 15 * 60_000)
  return describeInvite(db(), getRouterParam(event, 'token') ?? '')
})
