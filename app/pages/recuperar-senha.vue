<script setup lang="ts">
import { readRememberedLogin } from '~/utils/remembered-login'

useHead({ title: 'Esqueci minha senha · Guilda' })
const login = ref('')
const sentTo = ref('')
const codeDigits = ref(Array.from({ length: 6 }, () => ''))
const code = computed(() => codeDigits.value.join(''))
const error = ref('')
const busy = ref(false)
const brand = ref<RememberedBrand | null>(null)
const resendIn = ref(0)
let resendTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  brand.value = readRememberedBrand()
  login.value = readRememberedLogin()?.login ?? ''
})
onUnmounted(() => clearInterval(resendTimer))
useHead(() => ({ htmlAttrs: { style: accentStyle(brand.value?.accent) } }))
function startResendCountdown(seconds = 120) {
  clearInterval(resendTimer)
  resendIn.value = seconds
  resendTimer = setInterval(() => {
    resendIn.value = Math.max(0, resendIn.value - 1)
    if (!resendIn.value) clearInterval(resendTimer)
  }, 1000)
}
const resendLabel = computed(() => `${Math.floor(resendIn.value / 60)}:${String(resendIn.value % 60).padStart(2, '0')}`)
function updateCode(e: Event, index: number) {
  const input = e.target as HTMLInputElement
  const digits = input.value.replace(/\D/g, '').slice(0, 6)
  if (digits.length > 1) {
    const accepted = digits.slice(0, 6 - index)
    for (let i = 0; i < accepted.length; i++) codeDigits.value[index + i] = accepted[i] ?? ''
    const next = Math.min(index + accepted.length, 5)
    document.querySelector<HTMLInputElement>(`[data-code-index="${next}"]`)?.focus()
    return
  }
  codeDigits.value[index] = digits
  input.value = digits
  if (digits && index < 5) document.querySelector<HTMLInputElement>(`[data-code-index="${index + 1}"]`)?.focus()
}
function codeKeydown(e: KeyboardEvent, index: number) {
  const input = e.target as HTMLInputElement
  if (e.key === 'Backspace' && !input.value && index > 0) {
    codeDigits.value[index - 1] = ''
    document.querySelector<HTMLInputElement>(`[data-code-index="${index - 1}"]`)?.focus()
  } else if (e.key === 'ArrowLeft' && index > 0) {
    document.querySelector<HTMLInputElement>(`[data-code-index="${index - 1}"]`)?.focus()
  } else if (e.key === 'ArrowRight' && index < 5) {
    document.querySelector<HTMLInputElement>(`[data-code-index="${index + 1}"]`)?.focus()
  }
}
async function submit() {
  error.value = ''
  const requestedLogin = sentTo.value || login.value.trim()
  if (requestedLogin.replace(/\D/g, '').length < 8) {
    error.value = 'Digite o celular com DDD.'
    return
  }
  busy.value = true
  try {
    await api('/password-reset/request', { method: 'POST', body: { login: requestedLogin } })
    sentTo.value = requestedLogin
    codeDigits.value = Array.from({ length: 6 }, () => '')
    startResendCountdown()
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
function changeNumber() {
  clearInterval(resendTimer)
  resendIn.value = 0
  sentTo.value = ''
  codeDigits.value = Array.from({ length: 6 }, () => '')
  error.value = ''
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
          {{ sentTo ? 'Vamos criar uma senha nova' : 'Esqueceu a senha?' }}
        </h1>
        <p class="door__lede">
          {{ sentTo ? 'Digite o código que chegou pelo WhatsApp.' : 'Sem problema. Te mandamos um código pelo WhatsApp para criar uma nova.' }}
        </p>
      </header>
      <div class="door__body">
        <form
          v-if="!sentTo"
          class="stack-md"
          style="gap:14px"
          novalidate
          @submit.prevent="submit"
        >
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
          <p
            class="soft"
            role="status"
          >
            Enviamos um código pelo WhatsApp para <strong style="color:var(--ink)">{{ sentTo }}</strong>. Ele vale por 10 minutos.
          </p>
          <fieldset
            class="field"
            style="border:0;padding:0;margin:0"
          >
            <legend class="field__label">
              Código de 6 números
            </legend>
            <div
              class="otp-inputs"
              role="group"
              aria-label="Código de seis números"
            >
              <input
                v-for="(_, index) in 6"
                :key="index"
                :data-code-index="index"
                class="input input--lg otp-input"
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                maxlength="6"
                :autocomplete="index === 0 ? 'one-time-code' : 'off'"
                :value="codeDigits[index]"
                :aria-label="`Dígito ${index + 1} do código`"
                @input="updateCode($event, index)"
                @keydown="codeKeydown($event, index)"
              >
            </div>
          </fieldset>
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
            Não chegou? Só recebe quem autorizou mensagens. Fale com a coordenação.
          </p>
          <button
            type="button"
            class="link"
            style="align-self:center"
            :disabled="busy || resendIn > 0"
            @click="submit"
          >
            {{ resendIn > 0 ? `Reenviar em ${resendLabel}` : 'Reenviar código' }}
          </button>
          <button
            type="button"
            class="link link--muted"
            style="align-self:center"
            :disabled="busy"
            @click="changeNumber"
          >
            Trocar número
          </button>
        </form>
      </div>
    </div>
  </main>
</template>
