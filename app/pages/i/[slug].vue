<script setup lang="ts">
import type { ChurchInfo } from '~/types'

// Decide o destino antes de montar a tela: quem coordena e ainda não configurou a igreja vai
// para a configuração inicial; quem não coordena não entra na coordenação. Redirecionar de
// dentro do componente, no meio da navegação, trocava a URL sem trocar a tela.
definePageMeta({
  middleware: [async (to) => {
    const slug = String(to.params.slug ?? '')
    const state = useState<ChurchInfo | null>('church-info', () => null)
    if (!state.value || state.value.church.slug !== slug) {
      try {
        state.value = await api<ChurchInfo>(`/churches/${slug}`)
      } catch {
        return // a própria tela mostra o erro (sem acesso, igreja inexistente)
      }
    }
    const base = `/i/${slug}`
    const isCoord = state.value.me.roles.includes('coordinator')
    if (to.path.startsWith(`${base}/coordenacao`) && !isCoord) return navigateTo(base, { replace: true })
    if (isCoord && !state.value.church.setupCompleted && to.path !== `${base}/coordenacao/comecar`) {
      return navigateTo(`${base}/coordenacao/comecar`, { replace: true })
    }
  }],
})

const route = useRoute()
const { info, capi, link, isCoordinator, isPastor, churchName, accent, logoUrl, prepMonth, slug } = useChurch()
const { memberships } = useSession()
const loadError = ref('')

async function loadChurch() {
  loadError.value = ''
  try {
    info.value = await capi<ChurchInfo>('')
    rememberBrand(info.value)
  } catch (e) {
    info.value = null
    loadError.value = apiErrorMessage(e, 'Igreja não encontrada.')
  }
}
await loadChurch()
watch(() => route.params.slug, loadChurch)

useHead(() => ({
  titleTemplate: (t?: string) => (t ? `${t} · ${churchName.value || 'Guilda'}` : churchName.value || 'Guilda'),
  htmlAttrs: { style: accentStyle(accent.value) },
  meta: [{ name: 'theme-color', content: accentPalette(accent.value).accent }],
}))

const me = computed(() => memberships.value.find((m) => m.slug === slug.value))
const myName = computed(() => me.value?.displayName ?? '')
const roleLabel = computed(() => roleTags([...(isCoordinator.value ? ['coordinator'] : []), ...(isPastor.value ? ['pastor'] : [])]).join(' · ') || 'Voluntário(a)')

// Telas da coordenação: só para quem coordena. A configuração inicial ocupa a tela toda.
const bare = computed(() => route.path === link('/coordenacao/comecar'))

const EXTRA = ['/coordenacao/configuracoes', '/coordenacao/mensagens', '/coordenacao/whatsapp', '/coordenacao/modelos', '/coordenacao/repertorio', '/coordenacao/importar', '/coordenacao/historico']
function starts(p: string) {
  return route.path === link(p) || route.path.startsWith(`${link(p)}/`)
}
const current = computed(() => {
  if (starts('/escala')) return 'escala'
  if (starts('/roteiros')) return 'roteiro'
  if (starts('/perfil')) return 'voce'
  if (starts('/coordenacao/preparar')) return 'preparar'
  if (starts('/coordenacao/pessoas')) return 'pessoas'
  if (EXTRA.some(starts)) return 'configuracoes'
  if (starts('/coordenacao')) return 'mesa'
  return 'inicio'
})
const attention = computed(() => info.value?.attention ?? 0)
const nav1 = computed(() => [
  { key: 'inicio', to: link(''), label: 'Início', icon: 'home' },
  { key: 'escala', to: link('/escala'), label: 'Escala da igreja', icon: 'calendar' },
  { key: 'roteiro', to: link('/roteiros'), label: 'Roteiro do culto', icon: 'book' },
])
const nav2 = computed(() => [
  { key: 'mesa', to: link('/coordenacao'), label: 'Mesa', icon: 'sparkle', badge: attention.value },
  { key: 'preparar', to: link(`/coordenacao/preparar/${prepMonth.value}`), label: `Preparar ${monthName(prepMonth.value)}`, icon: 'calendar', badge: 0 },
  { key: 'pessoas', to: link('/coordenacao/pessoas'), label: 'Pessoas e funções', icon: 'people', badge: 0 },
  { key: 'configuracoes', to: link('/coordenacao/configuracoes'), label: 'Configurações', icon: 'settings', badge: 0 },
])
const COORD = ['mesa', 'preparar', 'pessoas', 'configuracoes']
const tabs = computed(() => (isCoordinator.value
  ? [
      { key: 'inicio', to: link(''), label: 'Início', icon: 'home', badge: 0, on: current.value === 'inicio' },
      { key: 'mesa', to: link('/coordenacao'), label: 'Coordenar', icon: 'sparkle', badge: attention.value, on: COORD.includes(current.value) },
      { key: 'escala', to: link('/escala'), label: 'Escala', icon: 'calendar', badge: 0, on: current.value === 'escala' },
      { key: 'voce', to: link('/perfil'), label: 'Você', icon: 'user', badge: 0, on: current.value === 'voce' },
    ]
  : [
      { key: 'inicio', to: link(''), label: 'Início', icon: 'home', badge: 0, on: current.value === 'inicio' },
      { key: 'escala', to: link('/escala'), label: 'Escala', icon: 'calendar', badge: 0, on: current.value === 'escala' },
      { key: 'roteiro', to: link('/roteiros'), label: 'Roteiro', icon: 'book', badge: 0, on: current.value === 'roteiro' },
      { key: 'voce', to: link('/perfil'), label: 'Você', icon: 'user', badge: 0, on: current.value === 'voce' },
    ]))
</script>

<template>
  <div
    v-if="loadError"
    class="door"
  >
    <div class="door__card stack-md">
      <h1 class="h1--xs">
        Sem acesso
      </h1>
      <p class="soft">
        {{ loadError }}
      </p>
      <NuxtLink
        class="btn"
        to="/"
      >
        Voltar
      </NuxtLink>
    </div>
  </div>
  <NuxtPage v-else-if="info && bare" />
  <div
    v-else-if="info"
    class="shell"
  >
    <aside
      class="sidebar"
      aria-label="Navegação"
    >
      <NuxtLink
        :to="link('')"
        class="sidebar__church"
      >
        <ChurchMark
          :name="churchName"
          :src="logoUrl"
        />
        <span style="min-width:0"><span class="sidebar__name">{{ churchName }}</span><span class="sidebar__sub">na Guilda</span></span>
      </NuxtLink>
      <nav
        aria-label="Você"
        style="margin-top:18px"
      >
        <NuxtLink
          v-for="it in nav1"
          :key="it.key"
          :to="it.to"
          class="navitem"
          :aria-current="current === it.key ? 'page' : undefined"
          active-class=""
          exact-active-class=""
        >
          <Icon :name="it.icon" /><span>{{ it.label }}</span>
        </NuxtLink>
      </nav>
      <template v-if="isCoordinator">
        <p
          class="sidebar__label"
          aria-hidden="true"
        >
          Coordenação
        </p>
        <nav aria-label="Coordenação">
          <NuxtLink
            v-for="it in nav2"
            :key="it.key"
            :to="it.to"
            class="navitem"
            :aria-current="current === it.key ? 'page' : undefined"
            active-class=""
            exact-active-class=""
          >
            <Icon :name="it.icon" /><span>{{ it.label }}</span>
            <span
              v-if="it.badge"
              class="badge"
              :aria-label="`${it.badge} pedem atenção`"
            >{{ it.badge }}</span>
          </NuxtLink>
        </nav>
      </template>
      <NuxtLink
        :to="link('/perfil')"
        class="sidebar__me"
        style="margin-top:auto"
      >
        <span class="av">{{ initials(myName || '?') }}</span>
        <span style="min-width:0"><span class="sidebar__me-name">{{ myName }}</span><span class="sidebar__me-sub">{{ roleLabel }} · ver perfil</span></span>
      </NuxtLink>
      <NuxtLink
        v-if="memberships.length > 1"
        to="/"
        class="link link--muted"
        style="padding:10px 12px 0"
      >
        Trocar de igreja
      </NuxtLink>
    </aside>
    <div class="shell__col">
      <header class="mhead">
        <NuxtLink
          :to="link('')"
          class="mhead__church"
        >
          <ChurchMark
            :name="churchName"
            :src="logoUrl"
            :size="34"
            :radius="10"
            on-accent
          />
          <span class="mhead__name">{{ churchName }}</span>
        </NuxtLink>
        <NuxtLink
          :to="link('/perfil')"
          class="mhead__me"
          aria-label="Seu perfil"
        >
          {{ initials(myName || '?') }}
        </NuxtLink>
      </header>
      <main
        id="conteudo"
        class="main"
      >
        <NuxtPage />
      </main>
      <nav
        class="tabbar"
        aria-label="Principal"
      >
        <NuxtLink
          v-for="t in tabs"
          :key="t.key"
          :to="t.to"
          :aria-current="t.on ? 'page' : undefined"
          active-class=""
          exact-active-class=""
        >
          <Icon :name="t.icon" />
          <span>{{ t.label }}</span>
          <span
            v-if="t.badge"
            class="badge"
            :aria-label="`${t.badge} pedem atenção`"
          >{{ t.badge }}</span>
        </NuxtLink>
      </nav>
    </div>
  </div>
</template>
