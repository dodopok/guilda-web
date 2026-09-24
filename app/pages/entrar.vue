<script setup lang="ts">
import { forgetRememberedLogin, readRememberedLogin, rememberLogin } from '~/utils/remembered-login'
import type { RememberedLogin } from '~/utils/remembered-login'

useHead({ title: 'Entrar · Guilda' })
const route = useRoute()
const { load } = useSession()
const login = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)
const brand = ref<RememberedBrand | null>(null)
const remembered = ref<RememberedLogin | null>(null)
const manualEntry = ref(false)
const usingRemembered = computed(() => Boolean(remembered.value) && !manualEntry.value)
const firstName = computed(() => remembered.value?.displayName.split(' ')[0] ?? '')
onMounted(() => {
  brand.value = readRememberedBrand()
  remembered.value = readRememberedLogin()
})
useHead(() => ({ htmlAttrs: { style: accentStyle(brand.value?.accent) } }))

function useAnotherAccount() {
  forgetRememberedLogin()
  remembered.value = null
  manualEntry.value = true
  login.value = ''
  password.value = ''
  error.value = ''
}

async function submit() {
  error.value = ''
  busy.value = true
  const loginId = usingRemembered.value ? remembered.value!.login : login.value.trim()
  try {
    const res = await api<{ memberships: { slug: string }[] }>('/auth/login', { method: 'POST', body: { login: loginId, password: password.value } })
    const account = await load(true)
    if (account?.account.displayName) rememberLogin(loginId, account.account.displayName)
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
    class="door door--auth"
  >
    <div class="door__auth-card">
      <header class="door__hero">
        <DoorHead
          :name="brand?.name"
          :logo="brand?.logo"
          inverse
        />
        <h1 class="door__headline">
          {{ usingRemembered ? `Oi de novo, ${firstName}!` : 'Que bom te ver!' }}
        </h1>
        <p class="door__lede">
          {{ usingRemembered ? 'Entre na Guilda com a sua senha.' : 'Entre com o celular que recebeu o convite.' }}
        </p>
        <button
          v-if="usingRemembered"
          type="button"
          class="door__switch"
          @click="useAnotherAccount"
        >
          Não é você?
        </button>
      </header>
      <div class="door__body">
        <form
          class="stack-md"
          novalidate
          @submit.prevent="submit"
        >
          <label
            v-if="!usingRemembered"
            class="field"
          >
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
          v-if="!usingRemembered"
          class="muted"
          style="margin-top:22px;font-size:13.5px;text-align:center"
        >
          Ainda não tem acesso? A coordenação da sua igreja te envia um convite pelo WhatsApp.
        </p>
      </div>
    </div>
  </main>
</template>
