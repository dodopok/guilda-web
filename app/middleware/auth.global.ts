const PUBLIC = ['/entrar', '/recuperar-senha']
const PUBLIC_PREFIX = ['/convite/', '/redefinir-senha/']

export default defineNuxtRouteMiddleware(async (to) => {
  const isPublic = PUBLIC.includes(to.path) || PUBLIC_PREFIX.some((p) => to.path.startsWith(p))
  if (isPublic) return
  const { load } = useSession()
  const me = await load()
  if (!me) return navigateTo({ path: '/entrar', query: to.fullPath !== '/' ? { volta: to.fullPath } : {} })
})
