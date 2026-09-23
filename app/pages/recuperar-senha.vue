<script setup lang="ts">
useHead({ title: 'Esqueci minha senha · Guilda' })
const login = ref('')
const sentTo = ref('')
const code = ref('')
const error = ref('')
const busy = ref(false)
const brand = ref<RememberedBrand | null>(null)
onMounted(() => {
  brand.value = readRememberedBrand()
})
useHead(() => ({ htmlAttrs: { style: accentStyle(brand.value?.accent) } }))
async function submit() {
  error.value = ''
  if (login.value.replace(/\D/g, '').length < 8) {
    error.value = 'Digite o celular com DDD.'
    return
  }
  busy.value = true
  try {
    await api('/password-reset/request', { method: 'POST', body: { login: login.value } })
    sentTo.value = login.value.trim()
    code.value = ''
  } catch (e) {
    error.value = apiErrorMessage(e)
  } finally {
    busy.value = false
  }
}
// O código vale 10 minutos; com ele a pessoa segue para criar a senha nova.
async function verify() {
  error.value = ''
  if (code.value.replace(/\D/g, '').length !== 6) {
    error.value = 'O código tem 6 números.'
    return
  }
  busy.value = true
  try {
    const { token } = await api<{ token: string }>('/password-reset/verify', { method: 'POST', body: { login: sentTo.value, code: code.value } })
    await navigateTo(`/redefinir-senha/${token}`)
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
    <div
      class="door__card stack-md"
      style="max-width:440px;gap:14px"
    >
      <DoorHead
        :name="brand?.name"
        :logo="brand?.logo"
      />
      <form
        v-if="!sentTo"
        class="stack-md"
        style="gap:14px"
        novalidate
        @submit.prevent="submit"
      >
        <h1 style="font-size:26px;line-height:1.15">
          Esqueceu a senha?
        </h1>
        <p class="soft">
          Sem problema. Te mandamos um código pelo WhatsApp para criar uma nova.
        </p>
        <label class="field">
          <span class="field__label">Seu celular</span>
          <PhoneInput
            v-model="login"
            autocomplete="username"
            required
          />
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
          Enviar código pelo WhatsApp
        </button>
        <NuxtLink
          to="/entrar"
          class="link"
          style="align-self:center"
        >
          Voltar para entrar
        </NuxtLink>
      </form>
      <form
        v-else
        class="stack-md"
        style="gap:14px"
        novalidate
        @submit.prevent="verify"
      >
        <span
          style="width:64px;height:64px;border-radius:999px;background:#e3f3e8;color:var(--ok);display:grid;place-items:center;margin:0 auto"
        ><Icon
          name="send"
          :weight="2"
          style="width:28px;height:28px"
        /></span>
        <h1 style="font-size:26px;line-height:1.15;text-align:center">
          Digite o código
        </h1>
        <p
          class="soft"
          style="text-align:center"
          role="status"
        >
          Se o <strong style="color:var(--ink)">{{ sentTo }}</strong> tiver conta e autorizou mensagens, chega um código de 6 números no WhatsApp. Ele vale por 10 minutos.
        </p>
        <label class="field">
          <span class="field__label">Código</span>
          <input
            v-model="code"
            class="input input--lg"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="7"
            placeholder="000000"
            style="letter-spacing:.3em;text-align:center;font-weight:800"
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
          Continuar
        </button>
        <p
          class="small muted"
          style="text-align:center"
        >
          Não autorizou mensagens? Peça à coordenação para conferir seu cadastro.
        </p>
        <button
          type="button"
          class="link"
          style="align-self:center"
          :disabled="busy"
          @click="submit"
        >
          Não chegou? Enviar outro código
        </button>
        <NuxtLink
          to="/entrar"
          class="link link--muted"
          style="align-self:center"
        >
          Voltar para entrar
        </NuxtLink>
      </form>
    </div>
  </main>
</template>
