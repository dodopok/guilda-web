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
    <div class="door__box">
      <BrandMark class="door__mark" />
      <h1>Olá, {{ me?.account.displayName.split(' ')[0] }}</h1>
      <p
        v-if="memberships.length"
        class="lede"
      >
        Escolha a igreja.
      </p>
      <p
        v-else
        class="lede"
      >
        Sua conta ainda não participa de nenhuma igreja.
      </p>
      <ul
        v-if="memberships.length"
        class="lines"
        style="margin-top:1.5rem"
      >
        <li
          v-for="m in memberships"
          :key="m.churchId"
        >
          <NuxtLink
            :to="`/i/${m.slug}`"
            class="line"
            style="text-decoration:none;color:inherit"
          >
            <span class="line__main">
              <span
                class="line__title serif"
                style="font-size:1.3rem"
              >{{ m.name }}</span>
              <span
                class="line__sub"
                style="display:block"
              >{{ m.roles.map((r) => ROLE_LABEL[r]).join(' · ') }}</span>
            </span>
            <Icon
              name="arrow-right"
              style="width:1.3rem;height:1.3rem"
            />
          </NuxtLink>
        </li>
      </ul>
      <p
        v-if="me?.account.isPlatformAdmin"
        style="margin-top:1.5rem"
      >
        <NuxtLink to="/admin/igrejas">Cadastrar igreja</NuxtLink>
      </p>
      <button
        class="btn btn--quiet"
        style="margin-top:2rem"
        @click="logout"
      >
        Sair
      </button>
    </div>
  </main>
</template>
