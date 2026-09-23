import { revokeSession } from '../../../services/auth'

export default defineApiHandler(async (event) => {
  const header = getHeader(event, 'authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : getCookie(event, SESSION_COOKIE)
  if (token) await revokeSession(db(), token)
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
  return { ok: true }
})
