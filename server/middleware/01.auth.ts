import { getConfig } from '../config'
import { getDb } from '../db/client'
import { sha256 } from '../lib/crypto'
import { getSession } from '../services/auth'
import { SESSION_COOKIE } from '../utils/api'

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Resolve a sessão (cookie para a web, Bearer para o app nativo) e protege requisições
// com cookie contra CSRF exigindo origem igual à do app.
export default defineEventHandler(async (event) => {
  if (!event.path.startsWith('/api/')) return
  if (event.path.startsWith('/api/v1/webhooks/')) return

  const header = getHeader(event, 'authorization')
  const bearer = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined
  const cookie = getCookie(event, SESSION_COOKIE)
  const token = bearer || cookie
  const via = bearer ? 'bearer' : 'cookie'

  if (via === 'cookie' && cookie && UNSAFE.has(event.method)) {
    const origin = getHeader(event, 'origin')
    const fetchSite = getHeader(event, 'sec-fetch-site')
    const host = getRequestHost(event, { xForwardedHost: true })
    const allowed = new Set([new URL(getConfig().appBaseUrl).host, host])
    const sameOrigin = origin ? allowed.has(safeHost(origin)) : fetchSite === 'same-origin'
    if (!sameOrigin) {
      setResponseStatus(event, 403)
      return { error: { code: 'csrf_rejected', message: 'Origem da requisição não permitida.' } }
    }
  }

  if (!token) return
  const found = await getSession(getDb(), token)
  if (!found) {
    if (via === 'cookie') deleteCookie(event, SESSION_COOKIE, { path: '/' })
    return
  }
  event.context.auth = {
    accountId: found.account.id,
    isPlatformAdmin: found.account.isPlatformAdmin,
    displayName: found.account.displayName,
    login: found.account.login,
    tokenHash: sha256(token),
    via,
  }
})

function safeHost(origin: string): string {
  try {
    return new URL(origin).host
  } catch {
    return ''
  }
}
