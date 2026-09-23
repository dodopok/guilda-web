<script setup lang="ts">
useHead({ title: 'Recuperar acesso · Guilda' })
const login = ref('')
const sent = ref('')
const error = ref('')
const busy = ref(false)
async function submit() {
  error.value = ''
  busy.value = true
  try {
    const res = await api<{ message: string }>('/password-reset/request', { method: 'POST', body: { login: login.value } })
    sent.value = res.message
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
      <h1>Recuperar acesso</h1>
      <template v-if="sent">
        <p class="lede">
          {{ sent }}
        </p>
        <p style="margin-top:1rem">
          O link vale por 30 minutos. Se não chegar, peça à coordenação para reenviar seu acesso.
        </p>
        <p style="margin-top:1.5rem">
          <NuxtLink to="/entrar">Voltar para entrar</NuxtLink>
        </p>
      </template>
      <form
        v-else
        novalidate
        @submit.prevent="submit"
      >
        <p class="lede">
          Enviaremos um link pelo WhatsApp para você criar uma senha nova.
        </p>
        <div
          class="field"
          style="margin-top:1.5rem"
        >
          <label
            class="field__label"
            for="login"
          >Seu celular</label>
          <input
            id="login"
            v-model="login"
            class="input"
            inputmode="tel"
            autocomplete="username"
            required
          >
        </div>
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
          Enviar link
        </button>
        <p style="margin-top:1.5rem">
          <NuxtLink to="/entrar">Voltar</NuxtLink>
        </p>
      </form>
    </div>
  </main>
</template>
