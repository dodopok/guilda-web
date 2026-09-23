<script setup lang="ts">
useHead({ title: 'Esqueci minha senha · Guilda' })
const login = ref('')
const sentTo = ref('')
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
          Sem problema. Te mandamos um link pelo WhatsApp para criar uma nova.
        </p>
        <label class="field">
          <span class="field__label">Seu celular</span>
          <input
            v-model="login"
            class="input"
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
          Enviar link pelo WhatsApp
        </button>
        <NuxtLink
          to="/entrar"
          class="link"
          style="align-self:center"
        >
          Voltar para entrar
        </NuxtLink>
      </form>
      <div
        v-else
        class="stack-md"
        style="gap:14px"
        role="status"
      >
        <span
          style="width:64px;height:64px;border-radius:999px;background:#e3f3e8;color:var(--ok);display:grid;place-items:center;margin:0 auto"
        ><Icon
          name="send"
          :weight="2"
          style="width:28px;height:28px"
        /></span>
        <h1 style="font-size:26px;line-height:1.15;text-align:center">
          Link enviado
        </h1>
        <p
          class="soft"
          style="text-align:center"
        >
          Se o <strong style="color:var(--ink)">{{ sentTo }}</strong> tiver conta e autorizou mensagens, o link chega no WhatsApp dele. O link vale por 30 minutos.
        </p>
        <p
          class="small muted"
          style="text-align:center"
        >
          Não autorizou mensagens? Peça à coordenação para reenviar o seu acesso.
        </p>
        <button
          type="button"
          class="link"
          style="align-self:center"
          :disabled="busy"
          @click="submit"
        >
          Não chegou? Enviar de novo
        </button>
        <NuxtLink
          to="/entrar"
          class="link link--muted"
          style="align-self:center"
        >
          Voltar para entrar
        </NuxtLink>
      </div>
    </div>
  </main>
</template>
