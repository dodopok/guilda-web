import type { ChurchInfo } from '~/types'

// Igreja da rota /i/:slug. Toda chamada passa por /churches/:slug, e o servidor
// decide o que esta pessoa pode ver.
export function useChurch() {
  const route = useRoute()
  const slug = computed(() => String(route.params.slug ?? ''))
  const info = useState<ChurchInfo | null>('church-info', () => null)
  const roles = computed(() => info.value?.me.roles ?? [])
  const isCoordinator = computed(() => roles.value.includes('coordinator'))
  const isPastor = computed(() => roles.value.includes('pastor'))
  const tz = computed(() => info.value?.church.timezone ?? 'America/Sao_Paulo')

  function capi<T>(path: string, opts?: Parameters<typeof api>[1]) {
    return api<T>(`/churches/${slug.value}${path}`, opts as never) as Promise<T>
  }
  function link(path = '') {
    return `/i/${slug.value}${path}`
  }
  return { slug, info, roles, isCoordinator, isPastor, tz, capi, link }
}
