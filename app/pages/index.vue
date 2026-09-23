<script setup lang="ts">
useHead({ title: 'Guilda' })
const { me, memberships, logout } = useSession()
if (memberships.value.length === 1 && !me.value?.account.isPlatformAdmin) {
  await navigateTo(`/i/${memberships.value[0]!.slug}`, { replace: true })
}
</script>

<template>
  <main
    id="conteudo"
    class="door"
  >
    <div class="door__card stack-lg">
      <DoorHead />
      <div>
        <h1
          class="h1"
          style="font-size:28px"
        >
          Oi, {{ me?.account.displayName.split(' ')[0] }}!
        </h1>
        <p
          class="soft"
          style="margin-top:6px"
        >
          {{ memberships.length ? 'Escolha a igreja.' : 'Sua conta ainda não participa de nenhuma igreja.' }}
        </p>
      </div>
      <div
        v-if="memberships.length"
        class="card card--flush list"
      >
        <NuxtLink
          v-for="m in memberships"
          :key="m.churchId"
          :to="`/i/${m.slug}`"
          class="listrow"
        >
          <ChurchMark
            :name="m.name"
            :size="38"
            :radius="12"
          />
          <span class="grow strong">{{ m.name }}</span>
          <Icon
            name="chevron-right"
            class="listrow__chev"
          />
        </NuxtLink>
      </div>
      <NuxtLink
        v-if="me?.account.isPlatformAdmin"
        to="/admin/igrejas"
        class="btn btn--secondary"
      >
        Cadastrar igreja
      </NuxtLink>
      <button
        type="button"
        class="link link--muted"
        @click="logout"
      >
        Sair
      </button>
    </div>
  </main>
</template>
