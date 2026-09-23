<script setup lang="ts">
import type { Duty, Ministry, PersonAdmin } from '~/types'

useHead({ title: 'Pessoas' })
const route = useRoute()
const router = useRouter()
const { capi, tz, info } = useChurch()
const toast = useToast()

const { data, refresh } = await useAsyncData(`people-${route.params.slug}`, async () => {
  const [p, c] = await Promise.all([
    capi<{ people: PersonAdmin[] }>('/people'),
    capi<{ ministries: Ministry[], duties: Duty[] }>('/catalog'),
  ])
  return { people: p.people, ministries: c.ministries, duties: c.duties }
})

const FILTERS = [
  { key: 'todas', label: 'Todas' },
  { key: 'sem-acesso', label: 'Sem acesso' },
  { key: 'sem-consentimento', label: 'Sem WhatsApp autorizado' },
  { key: 'sem-funcao', label: 'Sem função' },
  { key: 'inativas', label: 'Inativas' },
]
const filter = computed({
  get: () => String(route.query.filtro ?? 'todas'),
  set: (v) => router.replace({ query: { ...route.query, filtro: v === 'todas' ? undefined : v } }),
})
const search = ref('')
const dutyName = computed(() => new Map((data.value?.duties ?? []).map((d) => [d.id, d.name])))
const list = computed(() => {
  const q = search.value.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
  return (data.value?.people ?? []).filter((p) => {
    if (q && !p.displayName.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').includes(q)) return false
    switch (filter.value) {
      case 'sem-acesso': return p.status === 'active' && !p.hasAccount
      case 'sem-consentimento': return p.status === 'active' && p.consent?.status !== 'granted'
      case 'sem-funcao': return p.status === 'active' && !p.dutyIds.length
      case 'inativas': return p.status === 'inactive'
      default: return p.status === 'active'
    }
  })
})
const counts = computed(() => {
  const ps = data.value?.people ?? []
  return {
    'todas': ps.filter((p) => p.status === 'active').length,
    'sem-acesso': ps.filter((p) => p.status === 'active' && !p.hasAccount).length,
    'sem-consentimento': ps.filter((p) => p.status === 'active' && p.consent?.status !== 'granted').length,
    'sem-funcao': ps.filter((p) => p.status === 'active' && !p.dutyIds.length).length,
    'inativas': ps.filter((p) => p.status === 'inactive').length,
  } as Record<string, number>
})

function accessText(p: PersonAdmin) {
  if (p.hasAccount) return { text: 'com acesso', tone: 'ok' }
  if (p.invite?.state === 'pending') return { text: 'convite enviado', tone: 'info' }
  if (p.invite?.state === 'expired') return { text: 'convite expirou', tone: 'wait' }
  return { text: 'sem convite', tone: 'plain' }
}
function consentText(p: PersonAdmin) {
  if (!p.phone) return { text: 'sem telefone', tone: 'wait' }
  if (p.consent?.status === 'granted') return { text: 'autorizado', tone: 'ok' }
  if (p.consent?.status === 'revoked') return { text: 'pediu para não receber', tone: 'plain' }
  return { text: 'sem autorização', tone: 'wait' }
}

// ---------------------------------------------------------------- edição
const editing = ref<PersonAdmin | null>(null)
const isNew = ref(false)
const form = reactive({ displayName: '', phone: '', roles: ['participant'] as string[], restExempt: false, notes: '', status: 'active', dutyIds: [] as string[] })
const formError = ref('')
function openNew() {
  isNew.value = true
  Object.assign(form, { displayName: '', phone: '', roles: ['participant'], restExempt: false, notes: '', status: 'active', dutyIds: [] })
  formError.value = ''
  editing.value = { id: '' } as PersonAdmin
}
function openEdit(p: PersonAdmin) {
  isNew.value = false
  Object.assign(form, { displayName: p.displayName, phone: p.phone ?? '', roles: [...p.roles], restExempt: p.restExempt, notes: p.notes ?? '', status: p.status, dutyIds: [...p.dutyIds] })
  consentForm.source = 'presencial'
  consentForm.evidenceNote = ''
  formError.value = ''
  editing.value = p
}
const sheetOpen = computed({ get: () => Boolean(editing.value), set: (v) => { if (!v) editing.value = null } })
const saving = ref(false)
async function save() {
  formError.value = ''
  saving.value = true
  try {
    if (isNew.value) {
      await capi('/people', { method: 'POST', body: { displayName: form.displayName, phone: form.phone || null, roles: form.roles, restExempt: form.restExempt, notes: form.notes || null, dutyIds: form.dutyIds } })
      toast.ok(`${form.displayName} cadastrado(a).`)
    } else {
      const id = editing.value!.id
      await capi(`/people/${id}`, { method: 'PATCH', body: { displayName: form.displayName, phone: form.phone || null, roles: form.roles, restExempt: form.restExempt, notes: form.notes || null, status: form.status } })
      await capi(`/people/${id}/qualifications`, { method: 'PUT', body: { dutyIds: form.dutyIds } })
      toast.ok('Alterações salvas.')
    }
    editing.value = null
    await refresh()
  } catch (e) {
    formError.value = apiErrorMessage(e)
  } finally {
    saving.value = false
  }
}

const consentForm = reactive({ source: 'presencial', evidenceNote: '' })
async function setConsent(status: 'granted' | 'revoked') {
  const p = editing.value
  if (!p) return
  try {
    await capi(`/people/${p.id}/consent`, { method: 'PUT', body: { status, source: consentForm.source, evidenceNote: consentForm.evidenceNote || null } })
    toast.ok(status === 'granted' ? 'Consentimento registrado.' : 'Revogação registrada: esta pessoa não recebe mais mensagens.')
    await refresh()
    editing.value = data.value?.people.find((x) => x.id === p.id) ?? null
  } catch (e) {
    toast.error(e)
  }
}

const BLOCKED: Record<string, string> = {
  no_consent: 'A mensagem ficou retida porque a pessoa ainda não autorizou o WhatsApp.',
  no_phone: 'A mensagem ficou retida: falta o telefone.',
  channel_disabled: 'O canal do WhatsApp está desativado.',
}
const lastInvite = ref<{ personId: string, messageId: string, status: string, blockedReason: string | null } | null>(null)
async function invite(p: PersonAdmin) {
  try {
    const r = await capi<{ messageId: string, messageStatus: string, blockedReason: string | null }>(`/people/${p.id}/invite`, { method: 'POST' })
    lastInvite.value = { personId: p.id, messageId: r.messageId, status: r.messageStatus, blockedReason: r.blockedReason }
    if (r.messageStatus === 'blocked') toast.error(BLOCKED[r.blockedReason ?? ''] ?? 'A mensagem não pôde ser enviada.')
    else toast.ok(p.hasAccount ? 'Link para nova senha enviado.' : `Convite enviado para ${p.displayName}.`)
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}
const simBody = ref<string | null>(null)
async function showSimulated(messageId: string) {
  try {
    await new Promise((r) => setTimeout(r, 400))
    const r = await capi<{ body: string }>(`/messages/${messageId}/simulated`)
    simBody.value = r.body
  } catch {
    toast.error('A mensagem ainda está na fila do trabalhador (pnpm worker). Tente em alguns segundos.')
  }
}
const simOpen = computed({ get: () => simBody.value !== null, set: (v) => { if (!v) simBody.value = null } })

const dutiesByMinistry = computed(() => (data.value?.ministries ?? []).map((m) => ({
  ministry: m,
  duties: (data.value?.duties ?? []).filter((d) => d.ministryId === m.id && d.active),
})).filter((g) => g.duties.length))
function toggleDuty(id: string) {
  form.dutyIds = form.dutyIds.includes(id) ? form.dutyIds.filter((x) => x !== id) : [...form.dutyIds, id]
}
function toggleRole(r: string) {
  form.roles = form.roles.includes(r) ? form.roles.filter((x) => x !== r) : [...form.roles, r]
}
</script>

<template>
  <div class="page page--wide">
    <div class="page-head">
      <p class="kicker">
        Cadastro
      </p>
      <div class="row row--between">
        <h1>Pessoas</h1>
        <button
          type="button"
          class="btn btn--primary"
          @click="openNew"
        >
          <Icon name="plus" /> Nova pessoa
        </button>
      </div>
      <p class="lede">
        Telefones e consentimento ficam só com a coordenação. Cada pessoa recebe um convite individual para criar a própria senha.
      </p>
    </div>

    <div
      class="row"
      style="margin-bottom:1rem"
    >
      <label
        class="sr-only"
        for="people-search"
      >Buscar pessoa</label>
      <input
        id="people-search"
        v-model="search"
        class="input"
        style="max-width:18rem"
        placeholder="Buscar pelo nome"
        type="search"
      >
      <div
        class="row"
        role="group"
        aria-label="Filtro"
        style="gap:.25rem"
      >
        <button
          v-for="f in FILTERS"
          :key="f.key"
          type="button"
          class="btn btn--small"
          :class="{ 'btn--primary': filter === f.key }"
          :aria-pressed="filter === f.key"
          @click="filter = f.key"
        >
          {{ f.label }} <span
            class="muted"
            :style="filter === f.key ? 'color:inherit;opacity:.8' : ''"
          >{{ counts[f.key] }}</span>
        </button>
      </div>
    </div>

    <EmptyState
      v-if="!list.length"
      :title="search ? 'Ninguém com esse nome' : 'Ninguém nesta lista'"
      :text="filter === 'todas' ? 'Cadastre as pessoas que servem na igreja.' : undefined"
    />
    <div
      v-else
      class="table-wrap"
    >
      <table class="table">
        <thead>
          <tr>
            <th scope="col">
              Nome
            </th>
            <th scope="col">
              Funções
            </th>
            <th scope="col">
              Acesso
            </th>
            <th scope="col">
              WhatsApp
            </th>
            <th scope="col">
              <span class="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="p in list"
            :key="p.id"
          >
            <th
              scope="row"
              style="font-weight:700"
            >
              <button
                type="button"
                class="btn btn--quiet"
                style="padding:0;min-height:0;color:var(--ink);text-decoration:none;font-weight:700"
                @click="openEdit(p)"
              >
                {{ p.displayName }}
              </button>
              <span
                class="small muted"
                style="display:block;font-weight:400"
              >
                {{ p.roles.filter((r) => r !== 'participant').map((r) => ROLE_LABEL[r]).join(' · ') }}{{ p.restExempt ? ' · fora da meta de folga' : '' }}
              </span>
            </th>
            <td class="small">
              {{ p.dutyIds.map((id) => dutyName.get(id)).filter(Boolean).join(', ') || '—' }}
            </td>
            <td>
              <span
                class="tag"
                :class="`tag--${accessText(p).tone}`"
              >{{ accessText(p).text }}</span>
            </td>
            <td>
              <span
                class="tag"
                :class="`tag--${consentText(p).tone}`"
              >{{ consentText(p).text }}</span>
            </td>
            <td
              class="nowrap"
              style="text-align:right"
            >
              <button
                v-if="p.status === 'active' && p.phone && !p.hasAccount"
                type="button"
                class="btn btn--small"
                @click="invite(p)"
              >
                {{ p.invite ? 'Reenviar convite' : 'Convidar' }}
              </button>
              <button
                v-else-if="p.status === 'active' && p.hasAccount"
                type="button"
                class="btn btn--quiet btn--small"
                @click="invite(p)"
              >
                Reenviar acesso
              </button>
              <button
                v-if="lastInvite?.personId === p.id && info?.whatsappMode === 'simulation' && lastInvite.status !== 'blocked'"
                type="button"
                class="btn btn--quiet btn--small"
                @click="showSimulated(lastInvite!.messageId)"
              >
                Ver mensagem simulada
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Sheet
      v-model:open="sheetOpen"
      :title="isNew ? 'Nova pessoa' : form.displayName"
      wide
    >
      <form
        id="person-form"
        @submit.prevent="save"
      >
        <div class="fields-2">
          <div class="field">
            <label
              class="field__label"
              for="p-name"
            >Nome</label>
            <input
              id="p-name"
              v-model="form.displayName"
              class="input"
              required
              autocomplete="off"
            >
          </div>
          <div class="field">
            <label
              class="field__label"
              for="p-phone"
            >Celular (WhatsApp)</label>
            <input
              id="p-phone"
              v-model="form.phone"
              class="input"
              inputmode="tel"
              autocomplete="off"
              placeholder="(51) 99999-9999"
              aria-describedby="p-phone-hint"
            >
            <span
              id="p-phone-hint"
              class="field__hint"
            >Trocar o número desfaz o consentimento e convites pendentes.</span>
          </div>
        </div>

        <fieldset style="margin-top:1.25rem">
          <legend>Papel na igreja</legend>
          <div class="row">
            <label
              v-for="r in ['coordinator', 'pastor', 'participant']"
              :key="r"
              class="check"
            >
              <input
                type="checkbox"
                :checked="form.roles.includes(r)"
                @change="toggleRole(r)"
              >
              <span class="check__text">{{ ROLE_LABEL[r] }}</span>
            </label>
          </div>
          <label class="check">
            <input
              v-model="form.restExempt"
              type="checkbox"
            >
            <span class="check__text">Fora da meta de domingo livre <span
              class="muted small"
              style="display:block"
            >Pastores já ficam fora automaticamente.</span></span>
          </label>
        </fieldset>

        <fieldset style="margin-top:1.25rem">
          <legend>Pode servir em</legend>
          <div
            v-for="g in dutiesByMinistry"
            :key="g.ministry.id"
            style="margin-top:.5rem"
          >
            <p class="kicker">
              {{ g.ministry.name }}
            </p>
            <div
              class="row"
              style="gap:0 1.25rem"
            >
              <label
                v-for="d in g.duties"
                :key="d.id"
                class="check"
              >
                <input
                  type="checkbox"
                  :checked="form.dutyIds.includes(d.id)"
                  @change="toggleDuty(d.id)"
                >
                <span class="check__text">{{ d.name }}</span>
              </label>
            </div>
          </div>
        </fieldset>

        <div
          class="field"
          style="margin-top:1.25rem"
        >
          <label
            class="field__label"
            for="p-notes"
          >Observações da coordenação</label>
          <textarea
            id="p-notes"
            v-model="form.notes"
            class="textarea"
            style="min-height:4rem"
          />
        </div>
        <label
          v-if="!isNew"
          class="check"
          style="margin-top:.5rem"
        >
          <input
            type="checkbox"
            :checked="form.status === 'inactive'"
            @change="form.status = form.status === 'active' ? 'inactive' : 'active'"
          >
          <span class="check__text">Pessoa inativa <span
            class="muted small"
            style="display:block"
          >Não aparece para escalar nem recebe mensagens. O histórico é mantido.</span></span>
        </label>
        <p
          v-if="formError"
          class="field__error"
          role="alert"
        >
          {{ formError }}
        </p>
      </form>

      <section
        v-if="!isNew && editing"
        class="section"
        style="margin-top:2rem"
      >
        <div class="section-head">
          <h2 style="font-size:1.2rem">
            Consentimento para WhatsApp
          </h2>
        </div>
        <p style="margin-top:.6rem">
          <template v-if="editing.consent?.status === 'granted'">
            Autorizado ({{ editing.consent.source }}) em {{ dateTime(editing.consent.updatedAt, tz) }}.
          </template>
          <template v-else-if="editing.consent?.status === 'revoked'">
            Revogado em {{ dateTime(editing.consent.updatedAt, tz) }}.
          </template>
          <template v-else>
            Ainda não registrado. Sem consentimento, nenhuma mensagem é enviada.
          </template>
        </p>
        <p
          v-if="editing.consent?.evidenceNote"
          class="small muted"
        >
          {{ editing.consent.evidenceNote }}
        </p>
        <div
          class="fields-2"
          style="margin-top:.75rem"
        >
          <label class="field"><span class="field__label">Como a pessoa autorizou</span>
            <select
              v-model="consentForm.source"
              class="select"
            >
              <option value="presencial">Pessoalmente</option>
              <option value="formulario">Formulário</option>
              <option value="whatsapp">Mensagem no WhatsApp</option>
              <option value="outro">Outro</option>
            </select>
          </label>
          <label class="field"><span class="field__label">Registro (opcional)</span><input
            v-model="consentForm.evidenceNote"
            class="input"
            placeholder="Ex.: confirmou após o culto de 20/09"
          ></label>
        </div>
        <div
          class="row"
          style="margin-top:.75rem"
        >
          <button
            type="button"
            class="btn btn--small"
            :disabled="!editing.phone"
            @click="setConsent('granted')"
          >
            Registrar autorização
          </button>
          <button
            v-if="editing.consent?.status === 'granted'"
            type="button"
            class="btn btn--small btn--no"
            @click="setConsent('revoked')"
          >
            Registrar revogação
          </button>
        </div>
      </section>

      <template #foot>
        <button
          type="button"
          class="btn"
          @click="editing = null"
        >
          Cancelar
        </button>
        <button
          type="submit"
          form="person-form"
          class="btn btn--primary"
          :disabled="saving"
        >
          {{ isNew ? 'Cadastrar' : 'Salvar' }}
        </button>
      </template>
    </Sheet>

    <Sheet
      v-model:open="simOpen"
      title="Mensagem simulada"
    >
      <p class="tag tag--sim">
        Simulação — esta mensagem não foi enviada
      </p>
      <p style="margin-top:1rem;white-space:pre-line;word-break:break-word">
        {{ simBody }}
      </p>
      <p
        class="muted small"
        style="margin-top:1rem"
      >
        No modo de simulação o link aparece aqui para testes locais. Com o canal oficial, o link só vai para o WhatsApp da pessoa.
      </p>
    </Sheet>
  </div>
</template>
