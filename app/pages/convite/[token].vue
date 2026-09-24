<script setup lang="ts">
import type { ChurchInfo } from '~/types'
import { rememberLogin } from '~/utils/remembered-login'

useHead({ title: 'Convite · Guilda', meta: [{ name: 'referrer', content: 'no-referrer' }] })
const route = useRoute()
const token = String(route.params.token)
const { load, me } = useSession()

interface InviteInfo { churchName: string, timezone: string, firstName: string, expiresAt: string, accountExists: boolean, accentColor: string, hasLogo: boolean, phoneMasked: string | null, reminderEnabled: boolean, reminderWeekday: number, reminderTime: string }
const invite = ref<InviteInfo | null>(null)
const loadError = ref('')
const password = ref('')
const confirm = ref('')
const error = ref('')
const busy = ref(false)
const slug = ref('')
const accepted = ref(false)
const phone = ref<string | null>(null)
const church = ref<ChurchInfo['church'] | null>(null)
const consent = ref(true)
const hadConsent = ref(false)

onMounted(async () => {
  try {
    invite.value = await api<InviteInfo>(`/invites/${token}`)
    phone.value = invite.value.phoneMasked
  } catch (e) {
    loadError.value = apiErrorMessage(e, 'Este convite não é mais válido.')
  }
})
useHead(() => ({ htmlAttrs: { style: accentStyle(invite.value?.accentColor) } }))
const logo = computed(() => (invite.value?.hasLogo ? `/api/v1/invites/${token}/logo` : null))

const canSubmit = computed(() => (invite.value?.accountExists ? password.value.length > 0 : password.value.length >= 10 && password.value === confirm.value))
const passwordStrength = computed(() => {
  if (!password.value) return { label: 'Mínimo de 10 caracteres', level: 0 }
  const score = Number(password.value.length >= 10) + Number(/[A-ZÀ-Ý]/.test(password.value)) + Number(/[a-zà-ÿ]/.test(password.value)) + Number(/\d/.test(password.value)) + Number(/[^A-Za-zÀ-ÿ0-9]/.test(password.value))
  return { label: score >= 4 ? 'Senha forte' : score >= 2 ? 'Senha média' : 'Senha fraca', level: score >= 4 ? 3 : score >= 2 ? 2 : 1 }
})
async function acceptInvite() {
  error.value = ''
  if (!accepted.value && !canSubmit.value) {
    error.value = invite.value?.accountExists ? 'Digite sua senha atual.' : 'Confira a senha: pelo menos 10 caracteres, digitada igual duas vezes.'
    return
  }
  busy.value = true
  try {
    if (!accepted.value) {
      const res = await api<{ churchSlug: string }>(`/invites/${token}/accept`, { method: 'POST', body: { password: password.value } })
      slug.value = res.churchSlug
      accepted.value = true
      await load(true)
      if (me.value?.account.login) rememberLogin(me.value.account.login, me.value.account.displayName)
      await loadConsentStep()
    }
    await saveConsentAndContinue()
  } catch (e) {
    error.value = apiErrorMessage(e)
  } finally {
    busy.value = false
  }
}

// Autorização para lembretes: só mensagens individuais, nada de grupo.
async function loadConsentStep() {
  try {
    const [info, me] = await Promise.all([
      api<ChurchInfo>(`/churches/${slug.value}`),
      api<{ profile: { phoneMasked: string | null, consent: { status: string } | null } }>(`/churches/${slug.value}/me`),
    ])
    church.value = info.church
    rememberBrand(info)
    phone.value = me.profile.phoneMasked
    hadConsent.value = me.profile.consent?.status === 'granted'
  } catch { /* segue sem o passo de consentimento */ }
}
async function saveConsentAndContinue() {
  if (phone.value && consent.value !== hadConsent.value) {
    await api(`/churches/${slug.value}/me/consent`, { method: 'PUT', body: { status: consent.value ? 'granted' : 'revoked' } })
  }
  await navigateTo(`/i/${slug.value}?bemvindo=1`)
}
const reminderLine = computed(() => {
  const c = church.value
  const enabled = c?.reminderEnabled ?? invite.value?.reminderEnabled
  if (!enabled) return 'Você recebe avisos individuais quando a coordenação publicar sua escala'
  const weekday = c?.reminderWeekday ?? invite.value?.reminderWeekday ?? 0
  const time = c?.reminderTime ?? invite.value?.reminderTime ?? '19:00'
  return `Toda ${WEEKDAYS[weekday]!.replace('-feira', '')} às ${hhmm(time)} você recebe suas tarefas dos próximos dias`
})
</script>

<template>
  <main
    id="conteudo"
    class="door door--auth"
  >
    <div class="door__auth-card">
      <header class="door__hero">
        <DoorHead
          v-if="invite"
          :name="invite.churchName"
          :logo="logo"
          inverse
        />
        <DoorHead
          v-else
          inverse
        />
        <h1 class="door__headline">
          <template v-if="invite">
            Oi, {{ invite.firstName }}! {{ invite.accountExists ? 'Vamos entrar na igreja.' : 'Falta só uma senha.' }}
          </template>
          <template v-else>
            Convite indisponível
          </template>
        </h1>
        <p class="door__lede">
          <template v-if="invite">
            {{ invite.accountExists ? `${invite.churchName} te convidou para entrar na Guilda.` : `${invite.churchName} te convidou para a Guilda. Crie sua senha e escolha seus lembretes.` }}
          </template>
          <template v-else>
            Peça à coordenação da sua igreja um novo convite.
          </template>
        </p>
      </header>
      <div class="door__body">
        <p
          v-if="loadError"
          class="soft"
          role="alert"
        >
          {{ loadError }} <NuxtLink to="/entrar">Entre por aqui.</NuxtLink>
        </p>
        <form
          v-else-if="invite"
          class="stack-lg"
          novalidate
          @submit.prevent="acceptInvite"
        >
          <div
            v-if="!accepted"
            class="stack-md"
          >
            <PasswordField
              v-model="password"
              :label="invite.accountExists ? 'Sua senha' : 'Crie sua senha'"
              :autocomplete="invite.accountExists ? 'current-password' : 'new-password'"
              :placeholder="invite.accountExists ? '' : 'pelo menos 10 caracteres'"
            />
            <p
              v-if="!invite.accountExists"
              class="password-strength"
              :class="`password-strength--${passwordStrength.level}`"
            >
              <span
                class="password-strength__bars"
                aria-hidden="true"
              ><i
                v-for="n in 3"
                :key="n"
                :class="{ on: n <= passwordStrength.level }"
              /></span>
              {{ passwordStrength.label }}
            </p>
            <PasswordField
              v-if="!invite.accountExists"
              v-model="confirm"
              label="Repita a senha"
              autocomplete="new-password"
            />
          </div>
          <section
            class="invite-consent"
            aria-label="Lembretes pelo WhatsApp"
          >
            <SwitchRow
              v-model="consent"
              title="Quero receber lembretes pelo WhatsApp"
              boxed
              large
              :disabled="!phone"
            />
            <p class="small soft">
              {{ reminderLine }}<template v-if="phone">
                no <strong style="color:var(--ink)">{{ phone }}</strong>
              </template>. Mensagens individuais, sem grupos.
            </p>
            <p
              v-if="!phone"
              class="small soft"
            >
              Seu celular ainda não está cadastrado. Peça à coordenação para incluir.
            </p>
          </section>
          <p
            v-if="error"
            class="form-error"
            role="alert"
          >
            {{ error }}
          </p>
          <button
            class="btn"
            :disabled="busy || (!accepted && !canSubmit)"
          >
            {{ busy ? 'Preparando sua conta…' : 'Entrar na Guilda' }}
          </button>
          <NuxtLink
            to="/entrar"
            class="link"
            style="align-self:center"
          >
            Já tem senha? Entrar
          </NuxtLink>
          <p
            class="muted"
            style="font-size:13px;text-align:center"
          >
            Este link é só seu e vale até {{ dayMonth(invite.expiresAt, invite.timezone) }}. Não o encaminhe.
          </p>
        </form>
      </div>
    </div>
  </main>
</template>
