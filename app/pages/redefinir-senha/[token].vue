<script setup lang="ts">
useHead({ title: 'Nova senha · Guilda', meta: [{ name: 'referrer', content: 'no-referrer' }] })
const route = useRoute()
const password = ref('')
const confirm = ref('')
const error = ref('')
const done = ref(false)
const busy = ref(false)
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
    <div class="door__box">
      <BrandMark class="door__mark" />
      <h1>Nova senha</h1>
      <template v-if="done">
        <p class="lede">
          Senha alterada. Por segurança, encerramos as sessões abertas em outros aparelhos.
        </p>
        <NuxtLink
          class="btn btn--primary btn--block"
          style="margin-top:1.5rem"
          to="/entrar"
        >Entrar</NuxtLink>
      </template>
      <form
        v-else
        novalidate
        @submit.prevent="submit"
      >
        <PasswordField
          v-model="password"
          label="Nova senha"
          autocomplete="new-password"
          hint="Pelo menos 10 caracteres."
        />
        <PasswordField
          v-model="confirm"
          label="Repita a nova senha"
          autocomplete="new-password"
        />
        <p
          v-if="error"
          class="field__error"
          role="alert"
        >
          {{ error }}
        </p>
        <button
          class="btn btn--primary btn--block"
          style="margin-top:1.5rem"
          :disabled="busy"
        >
          Salvar senha
        </button>
      </form>
    </div>
  </main>
</template>
