<script setup lang="ts">
useHead({ title: 'Você' })
const route = useRoute()
const { capi, churchName, isCoordinator, isPastor, link } = useChurch()
const { logout, memberships, me: sessionMe } = useSession()
const toast = useToast()
interface Profile { id: string, displayName: string, phone: string | null, phoneMasked: string | null, roles: string[], consent: { status: string, updatedAt: string, source: string } | null, duties: { dutyId: string, name: string }[] }
const { data, refresh } = await useAsyncData(`profile-${route.params.slug}`, () => capi<{ profile: Profile }>('/me'))
const p = computed(() => data.value?.profile)
const editOpen = ref(false)
const editBusy = ref(false)
const editingField = ref<'name' | 'phone'>('name')
const editForm = reactive({ displayName: '', phone: '' })
function editProfile(field: 'name' | 'phone') {
  if (!p.value) return
  editingField.value = field
  editForm.displayName = p.value.displayName
  editForm.phone = p.value.phone ?? ''
  editOpen.value = true
}
async function saveProfile() {
  if (!p.value) return
  editBusy.value = true
  try {
    const body = editingField.value === 'name'
      ? { displayName: editForm.displayName.trim() }
      : { phone: normalizePhoneBR(editForm.phone) }
    await capi('/me', { method: 'PATCH', body })
    await refresh()
    const membership = sessionMe.value?.memberships.find((m) => m.slug === String(route.params.slug))
    if (membership && p.value) membership.displayName = p.value.displayName
    editOpen.value = false
    toast.ok('Seu nome e celular foram atualizados.')
  } catch (e) {
    toast.error(e)
  } finally {
    editBusy.value = false
  }
}
const { data: counts } = await useAsyncData(`you-counts-${route.params.slug}`, async () => {
  const [t, s] = await Promise.all([
    capi<{ tasks: { service: { startsAt: string } }[] }>('/me/tasks').catch(() => ({ tasks: [] })),
    capi<{ swaps: { direction: string, status: string }[] }>('/me/swaps').catch(() => ({ swaps: [] })),
  ])
  return {
    upcoming: t.tasks.filter((x) => new Date(x.service.startsAt).getTime() >= Date.now()).length,
    swaps: s.swaps.filter((x) => x.direction === 'received' && x.status === 'proposed').length,
  }
})
const consentOn = computed(() => p.value?.consent?.status === 'granted')
const roleLabel = computed(() => roleTags([...(isCoordinator.value ? ['coordinator'] : []), ...(isPastor.value ? ['pastor'] : [])]).join(' · ') || 'Voluntário(a)')
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
    class="stack-md w-640 profile-page"
  >
    <div
      class="profile-heading row"
      style="gap:16px"
    >
      <span class="av av--xxl">{{ initials(p.displayName) }}</span>
      <div class="grow">
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

    <div class="profile-content-grid">
      <div class="card card--flush rows">
        <ToolLink
          :to="link('/tarefas')"
          icon="calendar"
          label="Suas escalas"
          :sub="counts?.upcoming ? plural(counts.upcoming, 'próxima tarefa', 'próximas tarefas') : 'Nada marcado'"
        />
        <ToolLink
          :to="link('/trocas')"
          icon="swap"
          label="Pedidos de troca"
          :sub="counts?.swaps ? 'Alguém precisa de você' : 'Nenhum pedido aberto'"
          :badge="counts?.swaps || null"
          badge-tone="red"
        />
      </div>

      <div class="card card--flush list">
        <div
          class="row"
          style="flex-wrap:nowrap;padding:14px 18px"
        >
          <div class="grow">
            <p style="font-weight:700">
              Nome
            </p>
            <p class="soft small">
              {{ p.displayName }}
            </p>
          </div>
          <button
            type="button"
            class="link profile-fact-action"
            @click="editProfile('name')"
          >
            Editar
          </button>
        </div>
        <div
          class="row"
          style="flex-wrap:nowrap;padding:14px 18px;border-top:1px solid var(--line-2)"
        >
          <div class="grow">
            <p style="font-weight:700">
              Celular
            </p>
            <p class="soft small">
              {{ displayPhone(p.phone) ?? 'não cadastrado' }}
            </p>
          </div>
          <button
            type="button"
            class="link profile-fact-action"
            @click="editProfile('phone')"
          >
            Editar
          </button>
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
        <div class="profile-actions">
          <NuxtLink
            v-if="memberships.length > 1"
            to="/?escolher=1"
            class="btn btn--secondary btn--sm"
          >Trocar de igreja</NuxtLink>
          <button
            type="button"
            class="btn btn--secondary btn--sm"
            style="color:var(--ink-2)"
            @click="logout"
          >
            <Icon
              name="logout"
              :weight="1.9"
              style="width:18px;height:18px"
            />Sair
          </button>
        </div>
      </div>
    </div>

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

    <Sheet
      v-model:open="editOpen"
      :title="editingField === 'name' ? 'Editar nome' : 'Editar celular'"
      :lede="editingField === 'phone' ? 'Se você trocar o celular, a autorização para mensagens será solicitada novamente.' : 'Use o nome que a coordenação reconhece na escala.'"
    >
      <form
        class="stack-md"
        @submit.prevent="saveProfile"
      >
        <label
          v-if="editingField === 'name'"
          class="field"
        ><span class="field__label">Seu nome</span><input
          v-model="editForm.displayName"
          class="input"
          autocomplete="name"
          required
          minlength="2"
        ></label>
        <label
          v-else
          class="field"
        ><span class="field__label">Celular</span><PhoneInput v-model="editForm.phone" /></label>
        <p class="small muted">
          A coordenação vê seu celular para organizar as escalas e o WhatsApp.
        </p>
        <button
          class="btn btn--block"
          :disabled="editBusy"
        >
          {{ editBusy ? 'Salvando…' : 'Salvar dados' }}
        </button>
      </form>
    </Sheet>
  </section>
</template>
