const KEY = 'guilda-last-login'

export interface RememberedLogin {
  login: string
  displayName: string
}

export function rememberLogin(login: string, displayName: string) {
  if (typeof localStorage === 'undefined' || !login.trim() || !displayName.trim()) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ login: login.trim(), displayName: displayName.trim() } satisfies RememberedLogin))
  } catch { /* armazenamento indisponível */ }
}

export function readRememberedLogin(): RememberedLogin | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<RememberedLogin> | null
    if (!value || typeof value.login !== 'string' || typeof value.displayName !== 'string') return null
    if (!value.login.trim() || !value.displayName.trim()) return null
    return { login: value.login.trim(), displayName: value.displayName.trim() }
  } catch {
    return null
  }
}

export function forgetRememberedLogin() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(KEY)
  } catch { /* armazenamento indisponível */ }
}
