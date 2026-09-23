<script setup lang="ts">
useHead({ title: 'Nova senha · Guilda', meta: [{ name: 'referrer', content: 'no-referrer' }] })
const route = useRoute()
const password = ref('')
const confirm = ref('')
const error = ref('')
const done = ref(false)
const busy = ref(false)
const brand = ref<RememberedBrand | null>(null)
onMounted(() => {
  brand.value = readRememberedBrand()
})
useHead(() => ({ htmlAttrs: { style: accentStyle(brand.value?.accent) } }))
async function submit() {
  error.value = ''
  if (password.value.length < 10 || password.value !== confirm.value) {
    error.value = 'Use pelo menos 10 caracteres e digite a mesma senha duas vezes.'
    return
  }
  busy.value = true
  try {
    await api('/password-reset/confirm', { method: 'POST', body: { token: String(route.params.token), password: password.value } })
    done.value = true
  } catch (e) {
    error.value = apiErrorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main
    id="conteudo"
    class="door"
  >
    <div class="door__card stack-lg">
      <DoorHead
        :name="brand?.name"
        :logo="brand?.logo"
      />
      <template v-if="done">
        <div>
          <h1
            class="h1"
            style="font-size:28px"
          >
            Senha nova pronta
          </h1>
          <p
            class="soft"
            style="margin-top:6px"
          >
            Por segurança, as sessões abertas em outros aparelhos foram encerradas.
          </p>
        </div>
        <NuxtLink
          to="/entrar"
          class="btn"
        >
          Entrar
        </NuxtLink>
      </template>
      <form
        v-else
        class="stack-md"
        novalidate
        @submit.prevent="submit"
      >
        <h1
          class="h1"
          style="font-size:28px"
        >
          Crie uma senha nova
        </h1>
        <PasswordField
          v-model="password"
          label="Nova senha"
          autocomplete="new-password"
          placeholder="pelo menos 10 caracteres"
        />
        <PasswordField
          v-model="confirm"
          label="Repita a senha"
          autocomplete="new-password"
        />
        <p
          v-if="error"
          class="form-error"
          role="alert"
        >
          {{ error }}
        </p>
        <button
          class="btn"
          :disabled="busy"
        >
          Salvar senha
        </button>
      </form>
    </div>
  </main>
</template>
