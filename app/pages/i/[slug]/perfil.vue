<script setup lang="ts">
useHead({ title: 'Você' })
const route = useRoute()
const { capi, tz } = useChurch()
const { me, logout, memberships } = useSession()
const toast = useToast()
interface Profile { id: string, displayName: string, phoneMasked: string | null, roles: string[], consent: { status: string, updatedAt: string, source: string } | null, duties: { dutyId: string, name: string }[] }
const { data, refresh } = await useAsyncData(`profile-${route.params.slug}`, () => capi<{ profile: Profile }>('/me'))
const p = computed(() => data.value?.profile)
const consentOn = computed(() => p.value?.consent?.status === 'granted')

async function setConsent(status: 'granted' | 'revoked') {
  try {
    await capi('/me/consent', { method: 'PUT', body: { status } })
    toast.ok(status === 'granted' ? 'Você voltará a receber lembretes pelo WhatsApp.' : 'Pronto: não enviaremos mais mensagens pelo WhatsApp.')
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}

const pw = reactive({ current: '', next: '', confirm: '' })
const pwError = ref('')
async function changePassword() {
  pwError.value = ''
  if (pw.next.length < 10 || pw.next !== pw.confirm) {
    pwError.value = 'A nova senha precisa de pelo menos 10 caracteres, digitada igual duas vezes.'
    return
  }
  try {
    await api('/auth/password', { method: 'POST', body: { current: pw.current, next: pw.next } })
    Object.assign(pw, { current: '', next: '', confirm: '' })
    toast.ok('Senha alterada. Sessões em outros aparelhos foram encerradas.')
  } catch (e) {
    pwError.value = apiErrorMessage(e)
  }
}
async function logoutOthers() {
  try {
    await api('/auth/sessions', { method: 'DELETE' })
    toast.ok('Sessões nos outros aparelhos encerradas.')
  } catch (e) {
    toast.error(e)
  }
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <p class="kicker">
        Sua conta
      </p>
      <h1>{{ p?.displayName ?? me?.account.displayName }}</h1>
      <p
        v-if="p"
        class="lede"
      >
        {{ p.roles.map((r) => ROLE_LABEL[r]).join(' · ') }}
      </p>
    </div>
    <template v-if="p">
      <dl class="dl">
        <dt>Celular</dt><dd>{{ p.phoneMasked ?? 'não cadastrado' }}</dd>
        <dt>Funções</dt><dd>{{ p.duties.map((d) => d.name).join(', ') || 'nenhuma ainda' }}</dd>
      </dl>
      <p
        class="muted small"
        style="margin-top:.75rem"
      >
        Para mudar telefone ou funções, fale com a coordenação.
      </p>

      <section class="section">
        <div class="section-head">
          <h2>Mensagens pelo WhatsApp</h2>
        </div>
        <p style="margin-top:.75rem">
          <template v-if="consentOn">
            Você autorizou receber lembretes de escala, avisos de troca e das músicas, individualmente.
          </template>
          <template v-else>
            Você não recebe mensagens da Guilda pelo WhatsApp. Suas escalas continuam aqui no app.
          </template>
        </p>
        <p
          v-if="p.consent"
          class="muted small"
        >
          Última alteração: {{ dateTime(p.consent.updatedAt, tz) }}.
        </p>
        <div
          class="row"
          style="margin-top:1rem"
        >
          <button
            v-if="consentOn"
            type="button"
            class="btn btn--no"
            @click="setConsent('revoked')"
          >
            Parar de receber
          </button>
          <button
            v-else-if="p.phoneMasked"
            type="button"
            class="btn btn--primary"
            @click="setConsent('granted')"
          >
            Quero receber lembretes
          </button>
        </div>
        <p
          class="muted small"
          style="margin-top:.75rem"
        >
          Você também pode responder PARAR a qualquer mensagem.
        </p>
      </section>

      <section class="section">
        <div class="section-head">
          <h2>Senha</h2>
        </div>
        <form
          style="margin-top:1rem;max-width:26rem"
          @submit.prevent="changePassword"
        >
          <PasswordField
            v-model="pw.current"
            label="Senha atual"
            autocomplete="current-password"
          />
          <PasswordField
            v-model="pw.next"
            label="Nova senha"
            autocomplete="new-password"
            hint="Pelo menos 10 caracteres."
          />
          <PasswordField
            v-model="pw.confirm"
            label="Repita a nova senha"
            autocomplete="new-password"
          />
          <p
            v-if="pwError"
            class="field__error"
            role="alert"
          >
            {{ pwError }}
          </p>
          <button
            class="btn"
            style="margin-top:1rem"
          >
            Trocar senha
          </button>
        </form>
      </section>

      <section class="section">
        <div class="section-head">
          <h2>Aparelhos</h2>
        </div>
        <div
          class="row"
          style="margin-top:1rem"
        >
          <button
            type="button"
            class="btn"
            @click="logoutOthers"
          >
            Sair dos outros aparelhos
          </button>
          <NuxtLink
            v-if="memberships.length > 1"
            class="btn"
            to="/"
          >Trocar de igreja</NuxtLink>
          <button
            type="button"
            class="btn btn--quiet"
            @click="logout"
          >
            <Icon name="logout" /> Sair
          </button>
        </div>
      </section>
    </template>
  </div>
</template>
