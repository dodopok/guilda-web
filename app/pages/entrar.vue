<script setup lang="ts">
useHead({ title: 'Entrar · Guilda' })
const route = useRoute()
const { load } = useSession()
const login = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    const res = await api<{ memberships: { slug: string }[] }>('/auth/login', { method: 'POST', body: { login: login.value, password: password.value } })
    await load(true)
    const back = typeof route.query.volta === 'string' && route.query.volta.startsWith('/') && !route.query.volta.startsWith('//') ? route.query.volta : null
    if (back) return navigateTo(back)
    if (res.memberships.length === 1) return navigateTo(`/i/${res.memberships[0]!.slug}`)
    return navigateTo('/')
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
      <h1>Entrar na Guilda</h1>
      <p class="lede">
        Suas escalas, confirmações e o roteiro do culto.
      </p>
      <form
        novalidate
        @submit.prevent="submit"
      >
        <div class="field">
          <label
            class="field__label"
            for="login"
          >Seu celular</label>
          <input
            id="login"
            v-model="login"
            class="input"
            type="text"
            inputmode="tel"
            autocomplete="username"
            placeholder="(51) 99999-9999"
            required
          >
          <span class="field__hint">O mesmo número em que você recebeu o convite.</span>
        </div>
        <PasswordField
          v-model="password"
          label="Senha"
          autocomplete="current-password"
        />
        <p
          v-if="error"
          class="field__error"
          role="alert"
          style="margin-top:1rem"
        >
          {{ error }}
        </p>
        <button
          class="btn btn--primary btn--block"
          style="margin-top:1.5rem"
          :disabled="busy"
        >
          {{ busy ? 'Entrando…' : 'Entrar' }}
        </button>
      </form>
      <p style="margin-top:1.5rem">
        <NuxtLink to="/recuperar-senha">Esqueci minha senha</NuxtLink>
      </p>
      <p
        class="muted small"
        style="margin-top:2.5rem"
      >
        Ainda não tem acesso? A coordenação da sua igreja envia um convite individual pelo WhatsApp.
      </p>
    </div>
  </main>
</template>
