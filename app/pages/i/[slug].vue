<script setup lang="ts">
import type { ChurchInfo } from '~/types'

const route = useRoute()
const { info, capi, link, isCoordinator } = useChurch()
const { me, memberships } = useSession()
const loadError = ref('')

async function loadChurch() {
  loadError.value = ''
  try {
    info.value = await capi<ChurchInfo>('')
  } catch (e) {
    info.value = null
    loadError.value = apiErrorMessage(e, 'Igreja não encontrada.')
  }
}
await loadChurch()
watch(() => route.params.slug, loadChurch)

const liturgical = computed(() => liturgicalKey(info.value?.liturgicalColor))
useHead(() => ({
  titleTemplate: (t?: string) => (t ? `${t} · ${info.value?.church.name ?? 'Guilda'}` : info.value?.church.name ?? 'Guilda'),
  htmlAttrs: { 'data-liturgical': liturgical.value ?? 'verde' },
}))

const tabs = computed(() => {
  const list = [
    { to: link(''), label: 'Início', icon: 'home', exact: true },
    { to: link('/escala'), label: 'Escala', icon: 'calendar' },
    { to: link('/roteiros'), label: 'Roteiro', icon: 'book' },
  ]
  if (isCoordinator.value) list.push({ to: link('/coordenacao'), label: 'Coordenação', icon: 'people' })
  list.push({ to: link('/perfil'), label: 'Você', icon: 'user' })
  return list
})
function isActive(t: { to: string, exact?: boolean }) {
  return t.exact ? route.path === t.to : route.path.startsWith(t.to)
}
const otherChurches = computed(() => memberships.value.length > 1)
</script>

<template>
  <div
    v-if="loadError"
    class="door"
  >
    <div class="door__box">
      <BrandMark class="door__mark" />
      <h1>Sem acesso</h1>
      <p class="lede">
        {{ loadError }}
      </p>
      <NuxtLink
        class="btn"
        style="margin-top:1.5rem"
        to="/"
      >Voltar</NuxtLink>
    </div>
  </div>
  <div v-else-if="info">
    <div
      v-if="isCoordinator && info.whatsappMode === 'simulation'"
      class="simbar"
      role="note"
    >
      WhatsApp em modo de simulação: nenhuma mensagem sai do servidor.
      <NuxtLink
        :to="link('/coordenacao/whatsapp')"
        style="color:inherit"
      >Configurar canal</NuxtLink>
    </div>
    <header class="topbar">
      <div class="topbar__inner">
        <NuxtLink
          :to="link('')"
          class="brand"
        >
          <BrandMark class="brand__mark" />
          <span class="brand__name">{{ info.church.name }}</span>
        </NuxtLink>
        <nav
          class="topnav"
          aria-label="Principal"
        >
          <NuxtLink
            v-for="t in tabs.slice(0, -1)"
            :key="t.to"
            :to="t.to"
            :aria-current="isActive(t) ? 'page' : undefined"
          >
            {{ t.label }}
          </NuxtLink>
        </nav>
        <div class="topbar__me">
          <NuxtLink
            v-if="otherChurches"
            to="/"
            class="btn btn--quiet btn--small"
          >Trocar igreja</NuxtLink>
          <NuxtLink
            :to="link('/perfil')"
            class="btn btn--icon"
            :aria-label="`Seu perfil: ${me?.account.displayName}`"
          >
            <Icon name="user" />
            <span class="sr-only">Perfil</span>
          </NuxtLink>
        </div>
      </div>
    </header>
    <main id="conteudo">
      <NuxtPage />
    </main>
    <nav
      class="tabbar"
      aria-label="Principal"
      :style="{ '--tabs': tabs.length }"
    >
      <NuxtLink
        v-for="t in tabs"
        :key="t.to"
        :to="t.to"
        :class="{ 'is-active': isActive(t) }"
        :aria-current="isActive(t) ? 'page' : undefined"
        active-class=""
        exact-active-class=""
      >
        <Icon :name="t.icon" />
        <span>{{ t.label }}</span>
      </NuxtLink>
    </nav>
  </div>
</template>
