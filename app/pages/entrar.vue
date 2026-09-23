<script setup lang="ts">
useHead({ title: 'Entrar · Guilda' })
const route = useRoute()
const { load } = useSession()
const login = ref('')
const password = ref('')
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
    <div class="door__card">
      <DoorHead
        :name="brand?.name"
        :logo="brand?.logo"
      />
      <h1
        class="h1"
        style="margin-top:24px;font-size:28px"
      >
        Que bom te ver!
      </h1>
      <p
        class="soft"
        style="margin-top:6px"
      >
        Entre com o celular que recebeu o convite.
      </p>
      <form
        class="stack-md"
        style="margin-top:22px"
        novalidate
        @submit.prevent="submit"
      >
        <label class="field">
          <span class="field__label">Seu celular</span>
          <PhoneInput
            id="login"
            v-model="login"
            class="input--lg"
            allow-text
            autocomplete="username"
            required
          />
        </label>
        <PasswordField
          v-model="password"
          label="Senha"
          autocomplete="current-password"
          placeholder="••••••••••"
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
          Entrar
        </button>
        <NuxtLink
          to="/recuperar-senha"
          class="link"
          style="text-align:center;font-size:14.5px"
        >
          Esqueci minha senha
        </NuxtLink>
      </form>
      <p
        class="muted"
        style="margin-top:22px;font-size:13.5px;text-align:center"
      >
        Ainda não tem acesso? A coordenação da sua igreja te envia um convite pelo WhatsApp.
      </p>
    </div>
  </main>
</template>
