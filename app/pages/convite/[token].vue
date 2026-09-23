<script setup lang="ts">
useHead({ title: 'Convite · Guilda', meta: [{ name: 'referrer', content: 'no-referrer' }] })
const route = useRoute()
const token = String(route.params.token)
const { load } = useSession()

interface InviteInfo { churchName: string, timezone: string, firstName: string, expiresAt: string, accountExists: boolean }
const info = ref<InviteInfo | null>(null)
const loadError = ref('')
const password = ref('')
const confirm = ref('')
const error = ref('')
const busy = ref(false)

onMounted(async () => {
  try {
    info.value = await api<InviteInfo>(`/invites/${token}`)
  } catch (e) {
    loadError.value = apiErrorMessage(e, 'Este convite não é mais válido.')
  }
})

const longEnough = computed(() => password.value.length >= 10)
const matches = computed(() => password.value.length > 0 && password.value === confirm.value)
const canSubmit = computed(() => info.value?.accountExists ? password.value.length > 0 : longEnough.value && matches.value)

async function submit() {
  error.value = ''
  if (!canSubmit.value) {
    error.value = info.value?.accountExists ? 'Digite sua senha atual.' : 'Confira a senha: pelo menos 10 caracteres, digitada igual duas vezes.'
    return
  }
  busy.value = true
  try {
    const res = await api<{ churchSlug: string }>(`/invites/${token}/accept`, { method: 'POST', body: { password: password.value } })
    await load(true)
    await navigateTo(`/i/${res.churchSlug}?bemvindo=1`)
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
      <template v-if="loadError">
        <h1>Convite indisponível</h1>
        <p class="lede">
          {{ loadError }}
        </p>
        <p style="margin-top:1rem">
          Peça à coordenação da sua igreja um novo convite. Se você já tem senha, <NuxtLink to="/entrar">entre por aqui</NuxtLink>.
        </p>
      </template>
      <template v-else-if="!info">
        <p class="loading">
          Abrindo convite…
        </p>
      </template>
      <template v-else>
        <p class="kicker">
          {{ info.churchName }}
        </p>
        <h1>Olá, {{ info.firstName }}!</h1>
        <p
          v-if="!info.accountExists"
          class="lede"
        >
          Você foi convidado(a) para a Guilda, onde ficam suas escalas. Crie uma senha só sua para entrar.
        </p>
        <p
          v-else
          class="lede"
        >
          Você já usa a Guilda em outra igreja. Digite a senha que você já usa para incluir {{ info.churchName }} na sua conta.
        </p>
        <form
          novalidate
          @submit.prevent="submit"
        >
          <template v-if="!info.accountExists">
            <PasswordField
              v-model="password"
              label="Crie sua senha"
              autocomplete="new-password"
              :minlength="10"
            />
            <ul
              class="lines lines--tight small"
              style="margin-top:.6rem"
              aria-live="polite"
            >
              <li>
                <StatusMark
                  :status="longEnough ? 'confirmed' : 'pending'"
                  short
                /> Pelo menos 10 caracteres
              </li>
            </ul>
            <PasswordField
              v-model="confirm"
              label="Repita a senha"
              autocomplete="new-password"
            />
            <p
              v-if="confirm && !matches"
              class="field__error"
            >
              As senhas estão diferentes.
            </p>
          </template>
          <PasswordField
            v-else
            v-model="password"
            label="Sua senha atual"
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
            {{ busy ? 'Salvando…' : info.accountExists ? 'Incluir esta igreja' : 'Criar senha e entrar' }}
          </button>
        </form>
        <p
          class="muted small"
          style="margin-top:1.5rem"
        >
          Este link é pessoal e vale até {{ dateTime(info.expiresAt, info.timezone) }}. Não o encaminhe.
        </p>
      </template>
    </div>
  </main>
</template>
