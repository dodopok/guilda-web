<script setup lang="ts">
import type { Duty, Ministry, PersonAdmin } from '~/types'

useHead({ title: 'Pessoas e funções' })
const route = useRoute()
const router = useRouter()
const { capi, link, info } = useChurch()
const toast = useToast()

const { data, refresh } = await useAsyncData(`people-${route.params.slug}`, async () => {
  const [people, catalog] = await Promise.all([capi<{ people: PersonAdmin[] }>('/people'), capi<{ ministries: Ministry[], duties: Duty[] }>('/catalog')])
  return { people: people.people, ministries: catalog.ministries, duties: catalog.duties }
})
const tab = computed(() => (route.query.aba === 'funcoes' ? 'funcoes' : 'pessoas'))
function setTab(t: string) {
  router.replace({ query: { ...route.query, aba: t === 'funcoes' ? 'funcoes' : undefined } })
}
const dutyName = (id: string) => data.value?.duties.find((d) => d.id === id)?.name ?? ''
const activeDuties = computed(() => (data.value?.duties ?? []).filter((d) => d.active))
const groups = computed(() => (data.value?.ministries ?? []).map((m) => ({ m, duties: activeDuties.value.filter((d) => d.ministryId === m.id) })).filter((g) => g.duties.length))

// ------------------------------------------------------------ pessoas
const search = ref('')
type FilterKey = 'todas' | 'coordenacao' | 'pastores' | 'sem-acesso' | 'sem-whatsapp' | 'sem-funcao' | 'inativas' | `duty:${string}`
const filter = ref<FilterKey>('todas')
const hasWa = (p: PersonAdmin) => Boolean(p.phone) && p.consent?.status === 'granted'
const activePeople = computed(() => (data.value?.people ?? []).filter((p) => p.status === 'active'))
const notEntered = computed(() => activePeople.value.filter((p) => !p.hasAccount))
const inviteReady = computed(() => notEntered.value.filter((p) => Boolean(p.phone) && p.consent?.status === 'granted'))
const filters = computed(() => {
  const list: { key: FilterKey, label: string, n: number }[] = [
    { key: 'todas' as const, label: 'Todas', n: activePeople.value.length },
    { key: 'coordenacao' as const, label: 'Coordenação', n: activePeople.value.filter((p) => p.roles.includes('coordinator')).length },
    { key: 'pastores' as const, label: 'Pastores', n: activePeople.value.filter((p) => p.roles.includes('pastor')).length },
    { key: 'sem-acesso' as const, label: 'Sem acesso', n: activePeople.value.filter((p) => !p.hasAccount).length },
    { key: 'sem-whatsapp' as const, label: 'Sem WhatsApp', n: activePeople.value.filter((p) => !hasWa(p)).length },
    { key: 'sem-funcao' as const, label: 'Sem função', n: activePeople.value.filter((p) => !p.dutyIds.length).length },
  ]
  const inactive = (data.value?.people ?? []).filter((p) => p.status !== 'active').length
  if (inactive) list.push({ key: 'inativas' as const, label: 'Inativas', n: inactive })
  list.push(...activeDuties.value.map((d) => ({ key: `duty:${d.id}` as FilterKey, label: d.name, n: activePeople.value.filter((p) => p.dutyIds.includes(d.id)).length })))
  return list
})
const list = computed(() => {
  const q = search.value.trim().toLowerCase()
  const base = filter.value === 'inativas' ? (data.value?.people ?? []).filter((p) => p.status !== 'active') : activePeople.value
  const dutyId = filter.value.startsWith('duty:') ? filter.value.slice(5) : null
  return base.filter((p) => (!q || p.displayName.toLowerCase().includes(q))
    && (filter.value !== 'coordenacao' || p.roles.includes('coordinator'))
    && (filter.value !== 'pastores' || p.roles.includes('pastor'))
    && (filter.value !== 'sem-acesso' || !p.hasAccount)
    && (filter.value !== 'sem-whatsapp' || !hasWa(p))
    && (filter.value !== 'sem-funcao' || !p.dutyIds.length)
    && (!dutyId || p.dutyIds.includes(dutyId)))
})
const roleTag = (p: PersonAdmin) => roleTags(p.roles).join(' · ')
const dutiesLine = (p: PersonAdmin) => {
  const names = p.dutyIds.map(dutyName).filter(Boolean)
  return names.length ? names.slice(0, 3).join(' · ') + (names.length > 3 ? ` · +${names.length - 3}` : '') : 'Sem função marcada'
}
function personStatusLine(p: PersonAdmin) {
  if (!p.phone) return 'Sem celular cadastrado'
  if (p.consent?.status !== 'granted') return p.invite?.state === 'pending' && !p.hasAccount ? 'Convite enviado · ainda sem autorização do WhatsApp' : 'Ainda não autorizou o WhatsApp'
  if (p.hasAccount) return dutiesLine(p)
  if (p.invite?.state === 'pending') return 'Convite enviado · vale por 72 horas'
  if (p.invite?.state === 'expired') return 'Convite expirou'
  return 'Sem convite · WhatsApp autorizado'
}
function canInvite(p: PersonAdmin) {
  return !p.hasAccount && Boolean(p.phone) && p.consent?.status === 'granted'
}
// Folha da pessoa
const personId = ref<string | null>(null)
const person = computed(() => data.value?.people.find((p) => p.id === personId.value) ?? null)
const personOpen = computed({ get: () => Boolean(personId.value), set: (v) => { if (!v) personId.value = null } })
const personDuties = ref<Set<string>>(new Set())
const edit = reactive({ displayName: '', phone: '', roles: ['participant'] as string[], restExempt: false })
const savingPerson = ref(false)
function openPerson(id: string) {
  personId.value = id
  const p = data.value?.people.find((x) => x.id === id)
  personDuties.value = new Set(p?.dutyIds ?? [])
  Object.assign(edit, { displayName: p?.displayName ?? '', phone: p?.phone ?? '', roles: [...(p?.roles ?? ['participant'])], restExempt: p?.restExempt ?? false })
  lastInvite.value = null
}
async function setConsent(on: boolean) {
  const p = person.value
  if (!p) return
  try {
    await capi(`/people/${p.id}/consent`, { method: 'PUT', body: { status: on ? 'granted' : 'revoked', source: 'presencial' } })
    toast.ok(on ? 'Autorização registrada.' : 'Autorização retirada: nenhuma mensagem sai para esta pessoa.')
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}
const lastInvite = ref<{ messageId: string, status: string, blockedReason: string | null } | null>(null)
async function sendInvite(p: PersonAdmin) {
  try {
    const r = await capi<{ messageId: string, messageStatus: string, blockedReason: string | null }>(`/people/${p.id}/invite`, { method: 'POST' })
    lastInvite.value = { messageId: r.messageId, status: r.messageStatus, blockedReason: r.blockedReason }
    if (r.messageStatus === 'blocked') toast.error(`Convite criado, mas a mensagem não saiu: ${r.blockedReason === 'no_consent' ? 'a pessoa ainda não autorizou o WhatsApp' : r.blockedReason === 'no_phone' ? 'sem telefone' : 'canal indisponível'}.`)
    else toast.ok(`Convite enviado para ${p.displayName.split(' ')[0]} pelo WhatsApp.`)
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}
async function invite() {
  const p = person.value
  if (!p) return
  if (!p.phone) {
    toast.error('Cadastre o celular antes de enviar o convite.')
    return
  }
  if (p.consent?.status !== 'granted') {
    toast.error('Registre a autorização para receber WhatsApp antes de enviar o convite.')
    return
  }
  await sendInvite(p)
}
const bulkInviteBusy = ref(false)
async function inviteEveryoneReady() {
  if (!inviteReady.value.length) return
  bulkInviteBusy.value = true
  let sent = 0
  try {
    for (const p of inviteReady.value) {
      await capi(`/people/${p.id}/invite`, { method: 'POST' })
      sent++
    }
    toast.ok(`Convite enviado para ${plural(sent, 'pessoa', 'pessoas')}.`)
    await refresh()
  } catch (e) {
    await refresh()
    toast.error(e, sent ? `${sent} convites enviados; revise as pendências restantes.` : undefined)
  } finally {
    bulkInviteBusy.value = false
  }
}
const simulated = ref<string | null>(null)
async function showSimulated() {
  if (!lastInvite.value) return
  try {
    simulated.value = (await capi<{ body: string }>(`/messages/${lastInvite.value.messageId}/simulated`)).body
  } catch {
    toast.error('A mensagem ainda está na fila. Tente de novo em alguns segundos.')
  }
}
async function savePerson() {
  const p = person.value
  if (!p || savingPerson.value) return
  savingPerson.value = true
  try {
    const roles = [...new Set(['participant', ...edit.roles])]
    const changes: Record<string, unknown> = {}
    if (edit.displayName.trim() !== p.displayName) changes.displayName = edit.displayName.trim()
    if (normalizePhoneBR(edit.phone) !== (p.phone ?? null)) changes.phone = edit.phone.trim() || null
    if (roles.sort().join() !== [...p.roles].sort().join()) changes.roles = roles
    if (edit.restExempt !== p.restExempt) changes.restExempt = edit.restExempt
    if (Object.keys(changes).length) await capi(`/people/${p.id}`, { method: 'PATCH', body: changes })
    toast.ok('Alterações salvas.')
    personId.value = null
    await refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    savingPerson.value = false
  }
}
async function saveRoles() {
  const p = person.value
  if (!p) return
  const roles = [...new Set(['participant', ...edit.roles])]
  if (roles.slice().sort().join() === [...p.roles].sort().join()) return
  try {
    await capi(`/people/${p.id}`, { method: 'PATCH', body: { roles } })
    await refresh()
  } catch (e) {
    edit.roles = [...p.roles]
    toast.error(e)
  }
}
async function setActive(active: boolean) {
  const p = person.value
  if (!p) return
  try {
    await capi(`/people/${p.id}`, { method: 'PATCH', body: { status: active ? 'active' : 'inactive' } })
    toast.ok(active ? 'Pessoa reativada.' : 'Pessoa inativada. O histórico das escalas continua guardado.')
    personId.value = null
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}

// Nova pessoa
const newOpen = ref(false)
const np = reactive({ name: '', phone: '', roles: ['participant'] as string[] })
async function saveNew() {
  if (np.name.trim().length < 2) {
    toast.error('Escreva o nome.')
    return
  }
  try {
    const r = await capi<{ person: { id: string } }>('/people', { method: 'POST', body: { displayName: np.name.trim(), phone: np.phone.trim() || null, roles: np.roles } })
    toast.ok(`${np.name.trim().split(' ')[0]} entrou na lista. Agora marque as funções.`)
    newOpen.value = false
    Object.assign(np, { name: '', phone: '', roles: ['participant'] })
    await refresh()
    openPerson(r.person.id)
  } catch (e) {
    toast.error(e)
  }
}

// ------------------------------------------------------------ funções
const dutyId = ref<string | null>(null)
const duty = computed(() => data.value?.duties.find((d) => d.id === dutyId.value) ?? null)
const dutyOpen = computed({ get: () => Boolean(dutyId.value), set: (v) => { if (!v) dutyId.value = null } })
const dform = reactive({ name: '', instructions: '', required: 1, arrival: '' as string | number, musicNotice: false, inScript: true })
function openDuty(id: string) {
  dutyId.value = id
  const d = data.value?.duties.find((x) => x.id === id)
  Object.assign(dform, { name: d?.name ?? '', instructions: d?.instructions ?? '', required: d?.defaultRequiredCount ?? 1, arrival: d?.arrivalMinutesBefore ?? '', musicNotice: d?.receivesMusicNotice ?? false, inScript: d?.inScript ?? true })
}
const qualificationBusy = ref<string | null>(null)
async function togglePersonQualification(p: PersonAdmin) {
  const id = duty.value?.id
  if (!id || qualificationBusy.value) return
  const before = [...p.dutyIds]
  const next = before.includes(id) ? before.filter((d) => d !== id) : [...before, id]
  p.dutyIds = next
  qualificationBusy.value = p.id
  try {
    await capi(`/people/${p.id}/qualifications`, { method: 'PUT', body: { dutyIds: next } })
    await refresh()
  } catch (e) {
    p.dutyIds = before
    toast.error(e)
  } finally {
    qualificationBusy.value = null
  }
}
const ministryName = (id: string) => data.value?.ministries.find((m) => m.id === id)?.name ?? ''
const dutySub = (d: Duty) => {
  const n = activePeople.value.filter((p) => p.dutyIds.includes(d.id)).length
  return `${plural(d.defaultRequiredCount, 'pessoa', 'pessoas')} por culto · ${d.arrivalMinutesBefore ? `chega ${d.arrivalMinutesBefore} min antes` : 'horário a combinar'} · ${plural(n, 'habilitado', 'habilitados')}`
}
const lowPeopleDuties = computed(() => activeDuties.value.filter((d) => activePeople.value.filter((p) => p.dutyIds.includes(d.id)).length <= 2))
async function saveDuty() {
  const d = duty.value
  if (!d) return
  try {
    const arrival = dform.arrival === '' ? null : Number(dform.arrival)
    await capi(`/duties/${d.id}`, { method: 'PATCH', body: { name: dform.name.trim(), instructions: dform.instructions.trim() || null, defaultRequiredCount: Math.max(1, Number(dform.required) || 1), arrivalMinutesBefore: arrival, receivesMusicNotice: dform.musicNotice, inScript: dform.inScript } })
    toast.ok('Função salva. Vale para os próximos cultos criados.')
    dutyId.value = null
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}
async function removeDuty() {
  const d = duty.value
  if (!d || !window.confirm(`Tirar a função ${d.name}? Se ela já foi usada em escalas, fica desativada para preservar o histórico.`)) return
  try {
    const r = await capi<{ deleted: boolean }>(`/duties/${d.id}`, { method: 'DELETE' })
    toast.ok(r.deleted ? 'Função apagada.' : 'Função desativada. O histórico continua guardado.')
    dutyId.value = null
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}
const newDutyOpen = ref(false)
const nd = reactive({ ministryId: '', ministryName: '', name: '', required: 1, arrival: '' as string | number, instructions: '' })
function openNewDuty() {
  Object.assign(nd, { ministryId: data.value?.ministries[0]?.id ?? 'new', ministryName: '', name: '', required: 1, arrival: '', instructions: '' })
  newDutyOpen.value = true
}
async function saveNewDuty() {
  if (nd.name.trim().length < 2) {
    toast.error('Dê um nome à função.')
    return
  }
  try {
    let ministryId = nd.ministryId
    if (ministryId === 'new' || !ministryId) {
      if (nd.ministryName.trim().length < 2) {
        toast.error('Dê um nome ao novo ministério.')
        return
      }
      ministryId = (await capi<{ ministry: { id: string } }>('/ministries', { method: 'POST', body: { name: nd.ministryName.trim() } })).ministry.id
    }
    await capi('/duties', {
      method: 'POST',
      body: {
        ministryId,
        name: nd.name.trim(),
        defaultRequiredCount: Math.max(1, Number(nd.required) || 1),
        arrivalMinutesBefore: nd.arrival === '' ? null : Math.max(0, Number(nd.arrival) || 0),
        instructions: nd.instructions.trim() || null,
      },
    })
    toast.ok(`Função ${nd.name.trim()} criada. Agora marque quem pode fazer.`)
    newDutyOpen.value = false
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}
const dataOpen = ref(false)
const personDataDirty = computed(() => {
  const p = person.value
  return Boolean(p && (
    edit.displayName.trim() !== p.displayName
    || normalizePhoneBR(edit.phone) !== (p.phone ?? null)
    || edit.restExempt !== p.restExempt
  ))
})
const dutySaving = ref(false)
async function toggleDuty(id: string) {
  const p = person.value
  if (!p || dutySaving.value) return
  const before = new Set(personDuties.value)
  const next = new Set(before)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  personDuties.value = next
  dutySaving.value = true
  try {
    await capi(`/people/${p.id}/qualifications`, { method: 'PUT', body: { dutyIds: [...next] } })
    await refresh()
  } catch (e) {
    personDuties.value = before
    toast.error(e)
  } finally {
    dutySaving.value = false
  }
}
watch(personId, () => (dataOpen.value = false))
</script>

<template>
  <section
    v-if="data"
    class="stack-md"
  >
    <div
      class="row row--between"
      style="align-items:flex-end;gap:12px"
    >
      <div>
        <BackLink
          :to="link('/coordenacao')"
          label="Mesa"
        />
        <h1
          class="h1--sm"
          style="margin-top:6px"
        >
          {{ tab === 'pessoas' ? 'Pessoas' : 'Funções' }}
        </h1>
        <p
          class="soft small"
          style="margin-top:3px"
        >
          <template v-if="tab === 'pessoas'">
            {{ activePeople.length }} ativas · {{ activeDuties.length }} funções
          </template>
          <template v-else>
            {{ activeDuties.length }} funções · {{ data.ministries.length }} ministérios · {{ lowPeopleDuties.length }} com pouca gente
          </template>
        </p>
      </div>
      <div
        class="seg seg--white seg--dark"
        role="tablist"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'pessoas'"
          :aria-pressed="tab === 'pessoas'"
          @click="setTab('pessoas')"
        >
          Pessoas
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'funcoes'"
          :aria-pressed="tab === 'funcoes'"
          @click="setTab('funcoes')"
        >
          Funções
        </button>
      </div>
    </div>

    <div
      v-if="tab === 'pessoas' && notEntered.length"
      class="people-invite-summary"
    >
      <span class="grow">
        <strong>{{ notEntered.length }} ainda não entraram no app</strong>
        <small>{{ notEntered.slice(0, 3).map((p) => p.displayName.split(' ')[0]).join(', ') }}<template v-if="notEntered.length > 3"> e mais {{ notEntered.length - 3 }}</template></small>
      </span>
      <button
        v-if="inviteReady.length"
        type="button"
        class="btn btn--soft btn--sm"
        :disabled="bulkInviteBusy"
        @click="inviteEveryoneReady"
      >
        {{ bulkInviteBusy ? 'Enviando…' : inviteReady.length === notEntered.length ? (inviteReady.length === 1 ? 'Convidar 1 pessoa' : `Convidar as ${inviteReady.length}`) : `Convidar ${inviteReady.length}` }}
      </button>
      <span
        v-else
        class="small muted"
      >Resolva celular e autorização na própria pessoa.</span>
    </div>

    <template v-if="tab === 'pessoas'">
      <div class="row">
        <input
          v-model="search"
          type="search"
          class="input"
          style="flex:1 1 200px;width:auto;min-height:46px;border-radius:14px;font-size:15px"
          placeholder="Buscar pelo nome"
          aria-label="Buscar pelo nome"
        >
        <button
          type="button"
          class="btn btn--md"
          style="min-height:46px"
          @click="newOpen = true"
        >
          <Icon
            name="plus"
            :weight="2.2"
            style="width:18px;height:18px"
          />Nova
        </button>
      </div>
      <div
        class="chips"
        :class="{ 'people-filter-chips': filters.length > 6 }"
        role="group"
        aria-label="Filtro"
      >
        <button
          v-for="f in filters"
          :key="f.key"
          type="button"
          class="chip chip--dark"
          :aria-pressed="filter === f.key"
          @click="filter = f.key"
        >
          {{ f.label }} <span style="opacity:.7">{{ f.n }}</span>
        </button>
      </div>
      <div class="card card--flush list">
        <div
          v-for="p in list"
          :key="p.id"
          class="person-admin-row"
        >
          <button
            type="button"
            class="person-admin-row__main"
            @click="openPerson(p.id)"
          >
            <span class="av av--lg">{{ initials(p.displayName) }}</span>
            <span class="grow">
              <span
                class="row"
                style="gap:8px"
              ><span style="font-weight:800;font-size:16px">{{ p.displayName }}</span><span
                v-if="roleTag(p)"
                class="tag"
              >{{ roleTag(p) }}</span><span
                v-if="p.status !== 'active'"
                class="tag tag--no"
              >inativa</span></span>
              <span
                class="soft person-admin-row__status"
                :class="{ 'person-admin-row__status--wait': !p.phone || p.consent?.status !== 'granted' }"
              >{{ personStatusLine(p) }}</span>
            </span>
            <Icon
              name="chevron-right"
              :weight="2"
              class="listrow__chev"
            />
          </button>
          <div
            v-if="!p.hasAccount || !hasWa(p)"
            class="person-admin-row__action"
          >
            <button
              v-if="canInvite(p)"
              type="button"
              class="btn btn--soft btn--xs"
              :disabled="bulkInviteBusy"
              @click="sendInvite(p)"
            >
              {{ p.invite?.state === 'pending' ? 'Reenviar' : 'Convidar' }}
            </button>
            <button
              v-else
              type="button"
              class="link"
              @click="openPerson(p.id)"
            >
              {{ !p.phone ? 'Adicionar celular' : p.consent?.status !== 'granted' ? 'Registrar autorização' : 'Resolver' }}
            </button>
          </div>
        </div>
        <p
          v-if="!list.length"
          class="soft"
          style="padding:16px"
        >
          Ninguém com esse filtro.
        </p>
      </div>
    </template>

    <template v-else>
      <div
        class="row"
        style="justify-content:flex-end"
      >
        <button
          type="button"
          class="btn btn--md"
          style="font-size:15px"
          @click="openNewDuty"
        >
          <Icon
            name="plus"
            :weight="2.2"
            style="width:16px;height:16px"
          />Nova função
        </button>
      </div>
      <div
        v-if="lowPeopleDuties.length"
        class="people-low-duty-note"
      >
        <strong>{{ lowPeopleDuties.length }} {{ lowPeopleDuties.length === 1 ? 'função com pouca gente' : 'funções com pouca gente' }}</strong>
        <span>{{ lowPeopleDuties.map((d) => `${d.name} (${activePeople.filter((p) => p.dutyIds.includes(d.id)).length})`).join(' · ') }} — fica difícil revezar</span>
      </div>
      <div class="people-function-grid">
        <div
          v-for="g in groups"
          :key="g.m.id"
          class="card card--flush"
        >
          <p
            class="caps"
            style="padding:12px 16px 8px"
          >
            {{ g.m.name }}
          </p>
          <button
            v-for="d in g.duties"
            :key="d.id"
            type="button"
            class="listrow"
            style="border-top:1px solid var(--line-2)"
            @click="openDuty(d.id)"
          >
            <span class="grow"><span
              class="strong"
              style="display:block"
            >{{ d.name }}</span><span
              class="soft"
              style="display:block;font-size:13.5px"
            >{{ dutySub(d) }}</span></span>
            <span
              v-if="activePeople.filter((p) => p.dutyIds.includes(d.id)).length <= 2"
              class="tag tag--wait"
            >pouca gente</span>
            <Icon
              name="chevron-right"
              :weight="2"
              class="listrow__chev"
            />
          </button>
        </div>
      </div>
    </template>

    <!-- Pessoa -->
    <Sheet
      v-model:open="personOpen"
      placement="right"
      panel
      :label="person?.displayName"
    >
      <template
        v-if="person"
        #head
      >
        <div
          class="row"
          style="flex-wrap:nowrap;gap:14px"
        >
          <span class="av av--xl">{{ initials(person.displayName) }}</span>
          <div>
            <h2 class="sheet__title">
              {{ person.displayName }}
            </h2>
            <p class="soft small">
              {{ roleTag(person) || 'Voluntário(a)' }} · {{ displayPhone(person.phone) ?? 'Sem telefone' }}
            </p>
          </div>
        </div>
      </template>
      <template v-if="person">
        <div style="margin-top:14px">
          <span class="field__label">Papel na igreja</span>
          <RolePicker
            v-model="edit.roles"
            @update:model-value="saveRoles"
          />
          <p
            class="small muted"
            style="margin-top:6px"
          >
            Coordenação monta escalas e publica; pastor(a) aparece em “Quem prega?” e edita o roteiro. Uma pessoa pode ter os dois, e mais de uma pessoa pode coordenar.
          </p>
        </div>
        <div style="margin-top:14px;border:1.5px solid var(--control);border-radius:14px;overflow:hidden">
          <button
            type="button"
            class="listrow"
            style="padding:12px 14px"
            :aria-expanded="dataOpen"
            @click="dataOpen = !dataOpen"
          >
            <span class="grow"><span
              class="strong"
              style="display:block"
            >Dados</span><span
              class="muted"
              style="display:block;font-size:13.5px"
            >Nome, celular, descanso e desativar</span></span>
            <Icon
              :name="dataOpen ? 'chevron-up' : 'chevron-down'"
              class="listrow__chev"
            />
          </button>
          <div
            v-if="dataOpen"
            class="stack-md"
            style="padding:12px 14px 14px;border-top:1px solid var(--line-2)"
          >
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">
              <label class="field"><span class="field__label">Nome</span><input
                v-model="edit.displayName"
                class="input"
              ></label>
              <label class="field"><span class="field__label">Celular</span><PhoneInput
                v-model="edit.phone"
              /></label>
            </div>
            <p
              v-if="normalizePhoneBR(edit.phone) !== (person.phone ?? null) && person.phone"
              class="small"
              style="color:#a86400;margin-top:-6px"
            >
              Trocar o número retira a autorização do WhatsApp e cancela convites pendentes.
            </p>
            <SwitchRow
              v-model="edit.restExempt"
              title="Não entra no alerta de descanso"
              sub="Para quem serve todo domingo por escolha, como pastores."
              boxed
            />
            <button
              v-if="personDataDirty"
              type="button"
              class="btn btn--block"
              :disabled="savingPerson"
              @click="savePerson"
            >
              {{ savingPerson ? 'Salvando…' : 'Salvar dados' }}
            </button>
            <button
              type="button"
              class="link"
              style="align-self:flex-start"
              :style="person.status === 'active' ? 'color:var(--no)' : ''"
              @click="setActive(person.status !== 'active')"
            >
              {{ person.status === 'active' ? 'Desativar pessoa' : 'Reativar pessoa' }}
            </button>
          </div>
        </div>
        <div
          class="stack-sm"
          style="margin-top:16px"
        >
          <SwitchRow
            :model-value="person.consent?.status === 'granted'"
            title="Autorizou receber WhatsApp"
            sub="Registre quando a pessoa disser sim (pessoalmente ou por mensagem)."
            boxed
            :disabled="!person.phone"
            @update:model-value="setConsent"
          />
          <div
            v-if="person.hasAccount"
            class="panel panel--ok row"
            style="flex-wrap:nowrap;gap:10px;padding:12px 14px;border-radius:14px;color:var(--ok-ink);font-weight:700;font-size:14.5px"
          >
            <Icon
              name="check"
              :weight="2.2"
              style="width:18px;height:18px"
            />Já criou a senha e usa o app.
          </div>
          <div
            v-else
            class="row"
            style="padding:12px 14px;border-radius:14px;border:1.5px solid var(--control)"
          >
            <span
              class="grow"
              style="min-width:160px"
            ><span
              class="strong"
              style="display:block"
            >Ainda sem acesso ao app</span><span
              class="muted"
              style="display:block;font-size:13.5px"
            >{{ person.invite?.state === 'pending' ? 'Convite enviado. Vale por 72 horas.' : 'A pessoa cria a própria senha pelo link.' }}</span></span>
            <button
              type="button"
              class="btn btn--soft btn--sm"
              :disabled="!canInvite(person)"
              @click="invite"
            >
              {{ !person.phone ? 'Cadastre o celular primeiro' : person.consent?.status !== 'granted' ? 'Aguardando autorização' : person.invite?.state === 'pending' ? 'Reenviar convite' : 'Enviar convite pelo WhatsApp' }}
            </button>
          </div>
          <p
            v-if="!person.hasAccount && person.phone && person.consent?.status !== 'granted'"
            class="small soft"
          >
            Primeiro registre a autorização para receber WhatsApp; depois o convite pode ser enviado.
          </p>
          <p
            v-if="lastInvite && info?.whatsappMode === 'simulation' && lastInvite.status !== 'blocked'"
            class="small"
          >
            <span class="tag tag--wait">simulação</span> A mensagem não sai do servidor.
            <button
              type="button"
              class="link"
              @click="showSimulated"
            >
              Ver mensagem simulada
            </button>
          </p>
          <p
            v-if="simulated"
            class="bubble"
            style="word-break:break-all"
          >
            {{ simulated }}
          </p>
        </div>
        <p
          class="strong"
          style="margin:18px 0 8px"
        >
          O que esta pessoa pode fazer
        </p>
        <div class="stack-sm">
          <div
            v-for="g in groups"
            :key="g.m.id"
          >
            <p
              class="caps"
              style="font-size:12px;margin-bottom:6px"
            >
              {{ g.m.name }}
            </p>
            <div class="chips">
              <button
                v-for="d in g.duties"
                :key="d.id"
                type="button"
                class="chip"
                :aria-pressed="personDuties.has(d.id)"
                :disabled="dutySaving"
                @click="toggleDuty(d.id)"
              >
                <Icon
                  v-if="personDuties.has(d.id)"
                  name="check"
                  :weight="2.4"
                />{{ d.name }}
              </button>
            </div>
          </div>
        </div>
      </template>
    </Sheet>

    <Sheet
      v-model:open="newOpen"
      title="Nova pessoa"
      lede="Nome e celular bastam. Depois você marca as funções e envia o convite."
    >
      <form
        class="stack-md"
        @submit.prevent="saveNew"
      >
        <label class="field"><span class="field__label">Nome</span><input
          v-model="np.name"
          class="input"
          autocomplete="off"
        ></label>
        <label class="field"><span class="field__label">Celular (WhatsApp)</span><PhoneInput
          v-model="np.phone"
        /></label>
        <div>
          <span class="field__label">Papel na igreja</span>
          <RolePicker v-model="np.roles" />
        </div>
        <button class="btn btn--block">
          Cadastrar
        </button>
      </form>
    </Sheet>

    <!-- Função -->
    <Sheet
      v-model:open="dutyOpen"
      placement="right"
      panel
      :label="duty?.name"
    >
      <template
        v-if="duty"
        #head
      >
        <p class="caps">
          {{ ministryName(duty.ministryId) }}
        </p>
        <h2
          class="sheet__title"
          style="margin-top:2px"
        >
          {{ duty.name }}
        </h2>
      </template>
      <form
        v-if="duty"
        class="stack-md"
        style="margin-top:14px"
        @submit.prevent="saveDuty"
      >
        <label class="field"><span class="field__label">Nome</span><input
          v-model="dform.name"
          class="input"
        ></label>
        <label class="field"><span class="field__label">O que a pessoa faz (aparece para quem for escalado)</span><textarea
          v-model="dform.instructions"
          class="textarea"
          style="min-height:80px;font-size:15.5px"
        /></label>
        <div class="row">
          <label
            class="field grow"
            style="min-width:140px"
          ><span class="field__label">Pessoas por culto</span><input
            v-model="dform.required"
            type="number"
            min="1"
            max="50"
            class="input"
          ></label>
          <label
            class="field grow"
            style="min-width:140px"
          ><span class="field__label">Chega quantos min antes</span><input
            v-model="dform.arrival"
            type="number"
            min="0"
            max="600"
            class="input"
            placeholder="a combinar"
          ></label>
        </div>
        <SwitchRow
          v-model="dform.inScript"
          title="Aparece no roteiro do culto"
          sub="Liga para liturgia, leituras, pregação e louvor. Desliga para apoio (café, mídia, lojinha): fica só na escala."
          boxed
        />
        <SwitchRow
          v-model="dform.musicNotice"
          title="Recebe o aviso das músicas"
          sub="Quem está escalado nesta função recebe as músicas do culto."
          boxed
        />
        <div>
          <p
            class="strong"
            style="margin-bottom:8px"
          >
            Quem pode fazer
          </p>
          <p
            class="small muted"
            style="margin-bottom:8px"
          >
            Toque nos nomes para marcar quem está habilitado nesta função.
          </p>
          <div class="chips">
            <button
              v-for="p in activePeople"
              :key="p.id"
              type="button"
              class="chip"
              :aria-pressed="p.dutyIds.includes(duty.id)"
              :disabled="qualificationBusy === p.id || Boolean(qualificationBusy)"
              @click="togglePersonQualification(p)"
            >
              <Icon
                v-if="p.dutyIds.includes(duty.id)"
                name="check"
                :weight="2.4"
              />{{ p.displayName }}
            </button>
            <span
              v-if="!activePeople.length"
              class="soft small"
            >Cadastre as pessoas da igreja primeiro.</span>
          </div>
        </div>
        <button class="btn btn--block">
          Salvar
        </button>
        <button
          type="button"
          class="link link--muted"
          @click="removeDuty"
        >
          Tirar esta função
        </button>
      </form>
    </Sheet>

    <Sheet
      v-model:open="newDutyOpen"
      placement="right"
      title="Nova função"
      lede="Ela entra nos cultos e você marca quem pode fazer."
    >
      <form
        class="stack-md"
        novalidate
        @submit.prevent="saveNewDuty"
      >
        <label class="field"><span class="field__label">Nome</span><input
          v-model="nd.name"
          class="input"
          placeholder="Ex.: Som"
          maxlength="80"
        ></label>
        <div>
          <span class="field__label">Ministério</span>
          <div class="chips">
            <button
              v-for="m in data.ministries"
              :key="m.id"
              type="button"
              class="chip"
              :aria-pressed="nd.ministryId === m.id"
              @click="nd.ministryId = m.id"
            >
              {{ m.name }}
            </button>
            <button
              type="button"
              class="chip"
              :aria-pressed="nd.ministryId === 'new'"
              @click="nd.ministryId = 'new'"
            >
              <Icon
                name="plus"
                :weight="2.2"
              />Outro
            </button>
          </div>
        </div>
        <label
          v-if="nd.ministryId === 'new'"
          class="field"
        ><span class="field__label">Nome do novo ministério</span><input
          v-model="nd.ministryName"
          class="input"
          placeholder="Ex.: Recepção"
        ></label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <label class="field"><span class="field__label">Pessoas por culto</span><input
            v-model="nd.required"
            class="input"
            type="number"
            min="1"
            max="50"
            inputmode="numeric"
          ></label>
          <label class="field"><span class="field__label">Chega quantos min antes</span><input
            v-model="nd.arrival"
            class="input"
            type="number"
            min="0"
            max="600"
            inputmode="numeric"
            placeholder="a combinar"
          ></label>
        </div>
        <label class="field"><span class="field__label">O que a pessoa faz</span><textarea
          v-model="nd.instructions"
          class="textarea"
          style="min-height:70px;resize:vertical"
          placeholder="Aparece para quem for escalado"
        /></label>
        <button class="btn btn--block">
          Criar função
        </button>
      </form>
    </Sheet>
  </section>
</template>
