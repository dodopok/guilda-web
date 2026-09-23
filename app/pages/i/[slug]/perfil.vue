<script setup lang="ts">
useHead({ title: 'Você' })
const route = useRoute()
const { capi, churchName, isCoordinator, isPastor } = useChurch()
const { logout, memberships } = useSession()
const toast = useToast()
interface Profile { id: string, displayName: string, phoneMasked: string | null, roles: string[], consent: { status: string, updatedAt: string, source: string } | null, duties: { dutyId: string, name: string }[] }
const { data, refresh } = await useAsyncData(`profile-${route.params.slug}`, () => capi<{ profile: Profile }>('/me'))
const p = computed(() => data.value?.profile)
const consentOn = computed(() => p.value?.consent?.status === 'granted')
const roleLabel = computed(() => (isCoordinator.value ? 'Coordenação' : isPastor.value ? 'Pastoral' : 'Voluntário(a)'))
const { info } = useChurch()
const reminderText = computed(() => {
  const c = info.value?.church
  if (!c?.reminderEnabled) return 'Avisos da escala e pedidos da coordenação'
  return `Toda ${WEEKDAYS[c.reminderWeekday]!.replace('-feira', '')}, ${hhmm(c.reminderTime)}, com suas tarefas dos próximos dias`
})

async function setConsent(on: boolean) {
  try {
    await capi('/me/consent', { method: 'PUT', body: { status: on ? 'granted' : 'revoked' } })
    toast.ok(on ? 'Você voltará a receber lembretes pelo WhatsApp.' : 'Pronto: não enviaremos mais mensagens pelo WhatsApp.')
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}

const pwOpen = ref(false)
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
    pwOpen.value = false
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
  <section
    v-if="p"
    class="stack-md w-640"
  >
    <div
      class="row"
      style="flex-wrap:nowrap;gap:16px"
    >
      <span class="av av--xxl">{{ initials(p.displayName) }}</span>
      <div>
        <h1 style="font-size:26px;line-height:1.1">
          {{ p.displayName }}
        </h1>
        <p
          class="soft"
          style="margin-top:2px"
        >
          {{ roleLabel }} · {{ churchName }}
        </p>
      </div>
    </div>

    <div class="card card--flush list">
      <div
        class="row"
        style="flex-wrap:nowrap;padding:14px 18px"
      >
        <div class="grow">
          <p style="font-weight:700">
            Celular
          </p>
          <p class="soft small">
            {{ p.phoneMasked ?? 'não cadastrado' }}
          </p>
        </div>
        <span
          class="xsmall muted"
          style="font-weight:700"
        >só a coordenação vê</span>
      </div>
      <SwitchRow
        :model-value="consentOn"
        title="Lembretes pelo WhatsApp"
        :sub="reminderText"
        :disabled="!p.phoneMasked"
        @update:model-value="setConsent"
      />
      <div style="padding:14px 18px">
        <p style="font-weight:700">
          Suas funções
        </p>
        <p class="soft small">
          {{ p.duties.map((d) => d.name).join(' · ') || 'Nenhuma ainda. A coordenação marca o que você faz.' }}
        </p>
      </div>
      <div style="padding:14px 18px">
        <p style="font-weight:700">
          Senha
        </p>
        <div
          class="row"
          style="gap:4px 16px"
        >
          <button
            type="button"
            class="link"
            style="font-size:14.5px"
            @click="pwOpen = true"
          >
            Trocar senha
          </button>
          <button
            type="button"
            class="link link--muted"
            style="font-size:14.5px"
            @click="logoutOthers"
          >
            Sair dos outros aparelhos
          </button>
        </div>
      </div>
    </div>

    <NuxtLink
      v-if="memberships.length > 1"
      to="/"
      class="btn btn--secondary btn--md"
      style="align-self:flex-start;min-height:44px"
    >
      Trocar de igreja
    </NuxtLink>
    <button
      type="button"
      class="btn btn--secondary btn--md"
      style="align-self:flex-start;min-height:44px;color:var(--ink-2)"
      @click="logout"
    >
      <Icon
        name="logout"
        :weight="1.9"
        style="width:18px;height:18px"
      />Sair
    </button>

    <Sheet
      v-model:open="pwOpen"
      title="Trocar senha"
      lede="Use pelo menos 10 caracteres. As sessões em outros aparelhos serão encerradas."
    >
      <form
        class="stack-md"
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
          :minlength="10"
        />
        <PasswordField
          v-model="pw.confirm"
          label="Repita a nova senha"
          autocomplete="new-password"
          :minlength="10"
        />
        <p
          v-if="pwError"
          class="form-error"
          role="alert"
        >
          {{ pwError }}
        </p>
        <button class="btn btn--block">
          Salvar nova senha
        </button>
      </form>
    </Sheet>
  </section>
</template>
