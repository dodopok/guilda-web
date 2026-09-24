<script setup lang="ts">
import type { Membership } from '~/types'

useHead({ title: 'Escolher igreja · Guilda' })
const route = useRoute()
const { me, memberships, logout } = useSession()
if (memberships.value.length === 1 && !me.value?.account.isPlatformAdmin) {
  await navigateTo(`/i/${memberships.value[0]!.slug}`, { replace: true })
}
const firstName = computed(() => me.value?.account.displayName.split(' ')[0] ?? '')
const lastUsedSlug = ref('')
const rememberChoice = ref(false)
const sortedMemberships = computed(() => [...memberships.value].sort((a, b) => {
  if (a.slug === lastUsedSlug.value) return -1
  if (b.slug === lastUsedSlug.value) return 1
  return a.name.localeCompare(b.name, 'pt-BR')
}))
onMounted(() => {
  try {
    lastUsedSlug.value = localStorage.getItem('guilda-last-church') ?? ''
    rememberChoice.value = localStorage.getItem('guilda-remember-church') === 'true'
  } catch { /* armazenamento indisponível neste aparelho */ }
  if (rememberChoice.value && !route.query.escolher && !me.value?.account.isPlatformAdmin) {
    const last = memberships.value.find((membership) => membership.slug === lastUsedSlug.value)
    if (last) void navigateTo(`/i/${last.slug}`, { replace: true })
  }
})
function role(m: Membership) {
  return roleTags(m.roles).join(' · ') || 'Voluntário(a)'
}
function enter(m: Membership) {
  try {
    localStorage.setItem('guilda-last-church', m.slug)
    localStorage.setItem('guilda-remember-church', String(rememberChoice.value))
  } catch { /* navegação continua mesmo sem armazenamento */ }
  return navigateTo(`/i/${m.slug}`)
}
function setRememberChoice(value: boolean) {
  rememberChoice.value = value
  try {
    localStorage.setItem('guilda-remember-church', String(value))
  } catch { /* preferência vale apenas enquanto esta tela estiver aberta */ }
}
</script>

<template>
  <main
    id="conteudo"
    class="door"
  >
    <div
      class="stack-md"
      style="width:100%;max-width:480px;gap:14px"
    >
      <div style="text-align:center">
        <p class="caps">
          Oi, {{ firstName }}
        </p>
        <h1 style="margin-top:4px;font-size:28px;line-height:1.15;letter-spacing:-.02em">
          {{ memberships.length ? 'Em qual igreja você está hoje?' : 'Você ainda não participa de nenhuma igreja' }}
        </h1>
        <p
          v-if="!memberships.length"
          class="soft"
          style="margin-top:6px"
        >
          Peça à coordenação da sua igreja um convite.
        </p>
      </div>
      <div
        v-if="memberships.length"
        class="stack-sm"
        style="gap:10px"
      >
        <button
          v-for="m in sortedMemberships"
          :key="m.churchId"
          type="button"
          class="card row churchcard"
          @click.prevent="enter(m)"
        >
          <span
            style="width:52px;height:52px;border-radius:16px;display:grid;place-items:center;font-weight:800;font-size:15px;flex:none"
            :style="{ background: accentPalette(m.accentColor).accent, color: accentPalette(m.accentColor).ink }"
            aria-hidden="true"
          >{{ initials(m.name) }}</span>
          <span style="flex:1;min-width:0">
            <span
              class="strong"
              style="display:flex;align-items:center;gap:8px;font-size:17px"
            >{{ m.name }}<span
              v-if="m.slug === lastUsedSlug"
              class="tag tag--accent"
            >Última usada</span></span>
            <span
              class="soft"
              style="display:block;font-size:13.5px"
            >{{ role(m) }}{{ m.city ? ` · ${m.city}` : '' }}</span>
          </span>
          <Icon
            name="chevron-right"
            class="listrow__chev"
          />
        </button>
      </div>
      <label
        v-if="memberships.length > 1"
        class="row muted small"
        style="justify-content:center;gap:8px;margin-top:2px"
      >
        <input
          :checked="rememberChoice"
          type="checkbox"
          @change="setRememberChoice(($event.target as HTMLInputElement).checked)"
        >
        Lembrar minha escolha neste aparelho
      </label>
      <div
        v-if="me?.account.isPlatformAdmin"
        style="text-align:center"
      >
        <NuxtLink
          to="/admin/igrejas"
          class="btn btn--secondary btn--sm"
          style="min-height:44px;font-size:15px"
        >
          <Icon
            name="plus"
            :weight="2.2"
            style="width:16px;height:16px"
          />Nova igreja
        </NuxtLink>
        <p
          class="muted"
          style="margin-top:6px;font-size:12.5px"
        >
          Só quem administra a plataforma vê isto.
        </p>
      </div>
      <button
        type="button"
        class="link link--muted"
        style="align-self:center"
        @click="logout"
      >
        Sair
      </button>
    </div>
  </main>
</template>
