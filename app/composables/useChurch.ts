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
  const churchName = computed(() => info.value?.church.name ?? '')
  const accent = computed(() => info.value?.church.accentColor ?? DEFAULT_ACCENT)
  const logoUrl = computed(() => (info.value?.logoVersion ? `/api/v1/churches/${slug.value}/logo?v=${info.value.logoVersion}` : null))
  // Mês que a coordenação está preparando: a partir do dia 10, o seguinte.
  const prepMonth = computed(() => {
    const now = currentMonth(tz.value)
    const day = Number(localDateKey(new Date(), tz.value).slice(8, 10))
    return day >= 10 ? shiftMonth(now, 1) : now
  })

  function capi<T>(path: string, opts?: Parameters<typeof api>[1]) {
    return api<T>(`/churches/${slug.value}${path}`, opts as never) as Promise<T>
  }
  function link(path = '') {
    return `/i/${slug.value}${path}`
  }
  async function refreshInfo() {
    info.value = await capi<ChurchInfo>('')
    rememberBrand(info.value)
  }
  return { slug, info, roles, isCoordinator, isPastor, tz, churchName, accent, logoUrl, prepMonth, capi, link, refreshInfo }
}

// Guarda nome, cor e logo reduzido da última igreja usada neste aparelho, para a tela de
// entrar já aparecer com a cara da igreja. Nada sensível: é o que qualquer membro vê.
export interface RememberedBrand { name: string, slug: string, accent: string, logo: string | null }
export function rememberBrand(info: ChurchInfo | null) {
  if (!info || typeof localStorage === 'undefined') return
  const base: RememberedBrand = { name: info.church.name, slug: info.church.slug, accent: info.church.accentColor, logo: null }
  const save = (b: RememberedBrand) => {
    try {
      localStorage.setItem('guilda-brand', JSON.stringify(b))
    } catch { /* armazenamento indisponível */ }
  }
  if (!info.logoVersion) return save(base)
  const img = new Image()
  img.onload = () => {
    try {
      const c = document.createElement('canvas')
      c.width = 96
      c.height = 96
      c.getContext('2d')?.drawImage(img, 0, 0, 96, 96)
      save({ ...base, logo: c.toDataURL('image/png') })
    } catch {
      save(base)
    }
  }
  img.onerror = () => save(base)
  img.src = `/api/v1/churches/${info.church.slug}/logo?v=${info.logoVersion}`
}
export function readRememberedBrand(): RememberedBrand | null {
  try {
    const raw = localStorage.getItem('guilda-brand')
    return raw ? JSON.parse(raw) as RememberedBrand : null
  } catch {
    return null
  }
}
