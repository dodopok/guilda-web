import type { Membership, MeResponse } from '~/types'

export function useSession() {
  const me = useState<MeResponse | null>('me', () => null)
  const loaded = useState<boolean>('me-loaded', () => false)

  async function load(force = false) {
    if (loaded.value && !force) return me.value
    try {
      me.value = await api<MeResponse>('/auth/me')
    } catch {
      me.value = null
    }
    loaded.value = true
    return me.value
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
    me.value = null
    loaded.value = true
    await navigateTo('/entrar')
  }

  const memberships = computed<Membership[]>(() => me.value?.memberships ?? [])
  return { me, loaded, load, logout, memberships }
}
