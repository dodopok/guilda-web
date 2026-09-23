<script setup lang="ts">
import type { Membership } from '~/types'

useHead({ title: 'Escolher igreja · Guilda' })
const { me, memberships, logout } = useSession()
if (memberships.value.length === 1 && !me.value?.account.isPlatformAdmin) {
  await navigateTo(`/i/${memberships.value[0]!.slug}`, { replace: true })
}
const firstName = computed(() => me.value?.account.displayName.split(' ')[0] ?? '')
function role(m: Membership) {
  if (m.roles.includes('coordinator')) return 'Coordenação'
  if (m.roles.includes('pastor')) return 'Pastoral'
  return 'Voluntário(a)'
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
        <NuxtLink
          v-for="m in memberships"
          :key="m.churchId"
          :to="`/i/${m.slug}`"
          class="card row churchcard"
          style="gap:14px;flex-wrap:nowrap;color:inherit;text-decoration:none"
        >
          <span
            style="width:52px;height:52px;border-radius:16px;display:grid;place-items:center;font-weight:800;font-size:15px;flex:none"
            :style="{ background: accentPalette(m.accentColor).accent, color: accentPalette(m.accentColor).ink }"
            aria-hidden="true"
          >{{ initials(m.name) }}</span>
          <span style="flex:1;min-width:0">
            <span
              class="strong"
              style="display:block;font-size:17px"
            >{{ m.name }}</span>
            <span
              class="soft"
              style="display:block;font-size:13.5px"
            >{{ role(m) }}{{ m.city ? ` · ${m.city}` : '' }}</span>
          </span>
          <Icon
            name="chevron-right"
            class="listrow__chev"
          />
        </NuxtLink>
      </div>
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
