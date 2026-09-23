<script setup lang="ts">
import type { ChurchInfo } from '~/types'

useHead({ title: 'Convite · Guilda', meta: [{ name: 'referrer', content: 'no-referrer' }] })
const route = useRoute()
const token = String(route.params.token)
const { load } = useSession()

interface InviteInfo { churchName: string, timezone: string, firstName: string, expiresAt: string, accountExists: boolean, accentColor: string, hasLogo: boolean }
const invite = ref<InviteInfo | null>(null)
const loadError = ref('')
const step = ref(1)
const password = ref('')
const confirm = ref('')
const error = ref('')
const busy = ref(false)
const slug = ref('')

onMounted(async () => {
  try {
    invite.value = await api<InviteInfo>(`/invites/${token}`)
  } catch (e) {
    loadError.value = apiErrorMessage(e, 'Este convite não é mais válido.')
  }
})
useHead(() => ({ htmlAttrs: { style: accentStyle(invite.value?.accentColor) } }))
const logo = computed(() => (invite.value?.hasLogo ? `/api/v1/invites/${token}/logo` : null))

const canSubmit = computed(() => (invite.value?.accountExists ? password.value.length > 0 : password.value.length >= 10 && password.value === confirm.value))
async function createPassword() {
  error.value = ''
  if (!canSubmit.value) {
    error.value = invite.value?.accountExists ? 'Digite sua senha atual.' : 'Confira a senha: pelo menos 10 caracteres, digitada igual duas vezes.'
    return
  }
  busy.value = true
  try {
    const res = await api<{ churchSlug: string }>(`/invites/${token}/accept`, { method: 'POST', body: { password: password.value } })
    slug.value = res.churchSlug
    await load(true)
    await loadConsentStep()
    step.value = 2
  } catch (e) {
    error.value = apiErrorMessage(e)
  } finally {
    busy.value = false
  }
}

// Passo 2: autorização para lembretes (só mensagens individuais, nada de grupo).
const phone = ref<string | null>(null)
const church = ref<ChurchInfo['church'] | null>(null)
const consent = ref(true)
const hadConsent = ref(false)
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
    consent.value = true
  } catch { /* segue sem o passo de consentimento */ }
}
async function saveConsent() {
  error.value = ''
  if (phone.value && consent.value !== hadConsent.value) {
    busy.value = true
    try {
      await api(`/churches/${slug.value}/me/consent`, { method: 'PUT', body: { status: consent.value ? 'granted' : 'revoked' } })
    } catch (e) {
      error.value = apiErrorMessage(e)
      busy.value = false
      return
    }
    busy.value = false
  }
  step.value = 3
}
const reminderLine = computed(() => {
  const c = church.value
  if (!c?.reminderEnabled) return 'Você recebe suas tarefas e avisos da escala'
  return `Toda ${WEEKDAYS[c.reminderWeekday]!.replace('-feira', '')} às ${hhmm(c.reminderTime)} você recebe suas tarefas dos próximos dias`
})
</script>

<template>
  <main
    id="conteudo"
    class="door"
  >
    <div class="door__card door__card--md stack-lg">
      <template v-if="loadError">
        <DoorHead />
        <div>
          <h1
            class="h1"
            style="font-size:28px"
          >
            Convite indisponível
          </h1>
          <p
            class="soft"
            style="margin-top:8px"
          >
            {{ loadError }} Peça à coordenação da sua igreja um novo convite. Se você já tem senha, <NuxtLink to="/entrar">entre por aqui</NuxtLink>.
          </p>
        </div>
      </template>
      <template v-else-if="invite">
        <DoorHead
          :name="invite.churchName"
          :logo="logo"
          :size="44"
        >
          <span
            class="dots"
            aria-hidden="true"
          ><span
            v-for="n in 3"
            :key="n"
            :class="{ on: n <= step }"
          /></span>
        </DoorHead>

        <form
          v-if="step === 1"
          class="stack-lg"
          novalidate
          @submit.prevent="createPassword"
        >
          <div>
            <h1
              class="h1"
              style="font-size:28px"
            >
              Oi, {{ invite.firstName }}!
            </h1>
            <p
              v-if="invite.accountExists"
              class="soft"
              style="margin-top:8px"
            >
              A {{ invite.churchName }} te convidou para a Guilda. Você já tem conta com este celular: digite sua senha para entrar também nesta igreja.
            </p>
            <p
              v-else
              class="soft"
              style="margin-top:8px"
            >
              A {{ invite.churchName }} te convidou para a Guilda — o lugar onde ficam suas escalas, os lembretes e o roteiro do culto. Primeiro, crie uma senha só sua.
            </p>
          </div>
          <PasswordField
            v-model="password"
            :label="invite.accountExists ? 'Sua senha' : 'Crie sua senha'"
            :autocomplete="invite.accountExists ? 'current-password' : 'new-password'"
            :placeholder="invite.accountExists ? '' : 'pelo menos 10 caracteres'"
          />
          <PasswordField
            v-if="!invite.accountExists"
            v-model="confirm"
            label="Repita a senha"
            autocomplete="new-password"
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
            {{ invite.accountExists ? 'Entrar' : 'Criar senha' }}
          </button>
          <p
            class="muted"
            style="font-size:13px"
          >
            Este link é só seu e vale até {{ dayMonth(invite.expiresAt, invite.timezone) }}. Não o encaminhe.
          </p>
        </form>

        <template v-else-if="step === 2">
          <div>
            <h1
              class="h1"
              style="font-size:26px"
            >
              Quer receber lembretes pelo WhatsApp?
            </h1>
            <p
              class="soft"
              style="margin-top:8px"
            >
              {{ reminderLine }}<template v-if="phone">
                no <strong style="color:var(--ink)">{{ phone }}</strong>
              </template>. Nada de grupo: só mensagens suas.
            </p>
          </div>
          <SwitchRow
            v-model="consent"
            title="Sim, quero receber"
            boxed
            large
            :disabled="!phone"
          />
          <p
            v-if="!phone"
            class="small soft"
          >
            Seu celular ainda não está cadastrado. Peça à coordenação para incluir.
          </p>
          <p
            v-if="error"
            class="form-error"
            role="alert"
          >
            {{ error }}
          </p>
          <button
            type="button"
            class="btn"
            :disabled="busy"
            @click="saveConsent"
          >
            Continuar
          </button>
          <p
            class="muted"
            style="font-size:13px"
          >
            Você pode mudar isso depois, em “Você”.
          </p>
        </template>

        <template v-else>
          <h1
            class="h1"
            style="font-size:26px"
          >
            É simples assim
          </h1>
          <div class="stack-md">
            <div
              v-for="it in [
                { icon: 'calendar', t: 'Você recebe sua escala', s: 'A coordenação publica e você vê aqui e no WhatsApp.' },
                { icon: 'check', t: 'Confirma com um toque', s: 'Ou avisa que não pode — sem constrangimento, a coordenação resolve.' },
                { icon: 'book', t: 'O roteiro do culto fica aqui', s: 'Quem faz o quê, leituras e músicas do domingo.' },
              ]"
              :key="it.t"
              class="row"
              style="flex-wrap:nowrap;align-items:flex-start;gap:14px"
            >
              <span
                class="cta-card__icon"
                style="background:var(--accent-soft)"
              ><Icon
                :name="it.icon"
                :weight="1.9"
              /></span>
              <div>
                <p class="strong">
                  {{ it.t }}
                </p>
                <p
                  class="soft"
                  style="font-size:14.5px;margin-top:2px"
                >
                  {{ it.s }}
                </p>
              </div>
            </div>
          </div>
          <NuxtLink
            :to="`/i/${slug}?bemvindo=1`"
            class="btn"
          >
            Começar
          </NuxtLink>
        </template>
      </template>
    </div>
  </main>
</template>
