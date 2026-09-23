<script setup lang="ts">
useHead({ title: 'Recuperar acesso · Guilda' })
const login = ref('')
const sent = ref('')
const error = ref('')
const busy = ref(false)
const brand = ref<RememberedBrand | null>(null)
onMounted(() => {
  brand.value = readRememberedBrand()
})
useHead(() => ({ htmlAttrs: { style: accentStyle(brand.value?.accent) } }))
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
    <div class="door__card stack-lg">
      <DoorHead
        :name="brand?.name"
        :logo="brand?.logo"
      />
      <div>
        <h1
          class="h1"
          style="font-size:28px"
        >
          Esqueceu a senha?
        </h1>
        <p
          class="soft"
          style="margin-top:6px"
        >
          {{ sent || 'Digite o celular da sua conta. Se ele estiver cadastrado, você recebe um link pelo WhatsApp para criar uma senha nova.' }}
        </p>
      </div>
      <form
        v-if="!sent"
        class="stack-md"
        novalidate
        @submit.prevent="submit"
      >
        <label class="field">
          <span class="field__label">Seu celular</span>
          <input
            v-model="login"
            class="input input--lg"
            type="tel"
            inputmode="tel"
            autocomplete="username"
            placeholder="(51) 99999-9999"
            required
          >
        </label>
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
          Enviar link
        </button>
      </form>
      <NuxtLink
        to="/entrar"
        class="link"
        style="text-align:center;font-size:14.5px"
      >
        Voltar para entrar
      </NuxtLink>
    </div>
  </main>
</template>
