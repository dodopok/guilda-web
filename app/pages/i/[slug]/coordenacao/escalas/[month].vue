<script setup lang="ts">
import type { Alert, EditorAssignment, EditorService, EditorSlot, ScheduleEditor } from '~/types'

useHead({ title: 'Escala' })
const route = useRoute()
const router = useRouter()
const { capi, tz, link } = useChurch()
const toast = useToast()
const month = computed({
  get: () => String(route.params.month),
  set: (v: string) => router.replace(link(`/coordenacao/escalas/${v}`)),
})
const { data, refresh } = await useAsyncData(() => `editor-${route.params.slug}-${month.value}`, () => capi<ScheduleEditor>(`/schedule/${month.value}`), { watch: [month] })

const published = computed(() => data.value?.status === 'published')
const dutyById = computed(() => new Map((data.value?.duties ?? []).map((d) => [d.id, d])))
const personById = computed(() => new Map((data.value?.people ?? []).map((p) => [p.id, p])))
const loadById = computed(() => new Map((data.value?.loads ?? []).map((l) => [l.personId, l])))
const activeServices = computed(() => (data.value?.services ?? []))

// Linhas da grade: funções presentes em algum culto do mês, agrupadas por ministério.
const rows = computed(() => {
  const used = new Set(activeServices.value.flatMap((s) => s.slots.map((sl) => sl.dutyId)))
  const groups: { ministry: string, duties: { id: string, name: string }[] }[] = []
  for (const m of data.value?.ministries ?? []) {
    const ds = (data.value?.duties ?? []).filter((d) => d.ministryId === m.id && used.has(d.id))
    if (ds.length) groups.push({ ministry: m.name, duties: ds })
  }
  return groups
})
function slotFor(s: EditorService, dutyId: string) {
  return s.slots.find((sl) => sl.dutyId === dutyId)
}
const alertsByAssignment = computed(() => {
  const m = new Map<string, Alert[]>()
  for (const a of data.value?.alerts ?? []) for (const id of a.assignmentIds ?? []) m.set(id, [...(m.get(id) ?? []), a])
  return m
})
function filled(sl: EditorSlot) {
  return sl.assignments.filter((a) => a.status !== 'declined').length
}
function cellClass(s: EditorService, sl?: EditorSlot) {
  if (!sl || s.status === 'cancelled') return 'cell--na'
  if (filled(sl) < sl.requiredCount) return published.value ? 'cell--vacant' : 'cell--open'
  if (sl.assignments.some((a) => (alertsByAssignment.value.get(a.id) ?? []).some((x) => x.severity === 'strong'))) return 'cell--warn'
  return ''
}
function assignmentFlags(a: EditorAssignment) {
  const list = alertsByAssignment.value.get(a.id) ?? []
  return {
    unavailable: list.some((x) => x.type === 'unavailable'),
    clash: list.some((x) => x.type === 'clash'),
    notQualified: list.some((x) => x.type === 'not_qualified'),
    exceptional: a.exceptional,
  }
}

// ---------------------------------------------------------------- alertas agrupados
const ALERT_GROUPS: { type: string, title: string, tone: 'no' | 'wait' | 'info' }[] = [
  { type: 'vacancy', title: 'Vagas abertas', tone: 'no' },
  { type: 'declined', title: 'Recusas sem substituto', tone: 'no' },
  { type: 'unavailable', title: 'Escalados que não podem', tone: 'no' },
  { type: 'not_qualified', title: 'Sem habilitação', tone: 'no' },
  { type: 'clash', title: 'Choques de horário', tone: 'no' },
  { type: 'inactive_person', title: 'Pessoas inativas', tone: 'no' },
  { type: 'same_day_load', title: 'Muitas tarefas no mesmo dia', tone: 'wait' },
  { type: 'no_rest', title: 'Sem domingo livre', tone: 'wait' },
  { type: 'without_task', title: 'Habilitados sem tarefa no mês', tone: 'info' },
  { type: 'exceptional', title: 'Designações excepcionais', tone: 'info' },
]
const grouped = computed(() => ALERT_GROUPS.map((g) => ({ ...g, items: (data.value?.alerts ?? []).filter((a) => a.type === g.type) })).filter((g) => g.items.length))
const strongCount = computed(() => (data.value?.alerts ?? []).filter((a) => a.severity === 'strong').length)

// ---------------------------------------------------------------- folha da vaga
const open = ref<{ serviceId: string, slotId: string } | null>(null)
const current = computed(() => {
  if (!open.value) return null
  const s = activeServices.value.find((x) => x.id === open.value!.serviceId)
  const sl = s?.slots.find((x) => x.id === open.value!.slotId)
  return s && sl ? { service: s, slot: sl, duty: dutyById.value.get(sl.dutyId)! } : null
})
const sheetOpen = computed({ get: () => Boolean(open.value), set: (v) => { if (!v) closeSheet() } })
const search = ref('')
const replacing = ref<EditorAssignment | null>(null)
const pending = ref<{ personId: string, kind: 'unavailable' | 'exception' | 'replace' } | null>(null)
const reason = ref('')
const notifyNow = ref(false)
const working = ref(false)
function openSlot(s: EditorService, sl?: EditorSlot) {
  if (!sl || s.status === 'cancelled') return
  open.value = { serviceId: s.id, slotId: sl.id }
  search.value = ''
  replacing.value = null
  pending.value = null
  reason.value = ''
}
function closeSheet() {
  open.value = null
  replacing.value = null
  pending.value = null
}
// Abre direto pela URL (?vaga=) — usado pelas pendências.
watch(() => [route.query.vaga, data.value] as const, ([vaga]) => {
  if (typeof vaga !== 'string' || !data.value) return
  for (const s of data.value.services) {
    const sl = s.slots.find((x) => x.id === vaga)
    if (sl) openSlot(s, sl)
  }
}, { immediate: true })

interface Candidate { id: string, name: string, why: string[], warn: string[], load: string, score: number }
const candidates = computed(() => {
  const c = current.value
  if (!c) return { ok: [] as Candidate[], unavailable: [] as Candidate[], others: [] as Candidate[] }
  const q = search.value.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
  const inSlot = new Set(c.slot.assignments.map((a) => a.personId))
  const sameService = new Map<string, string[]>()
  const sameDay = new Map<string, string[]>()
  for (const s of activeServices.value) {
    for (const sl of s.slots) {
      for (const a of sl.assignments) {
        if (a.status === 'declined') continue
        const name = dutyById.value.get(sl.dutyId)?.name ?? ''
        if (s.id === c.service.id) sameService.set(a.personId, [...(sameService.get(a.personId) ?? []), name])
        else if (s.localDate === c.service.localDate) sameDay.set(a.personId, [...(sameDay.get(a.personId) ?? []), `${name} (${s.time})`])
      }
    }
  }
  const isSunday = new Date(`${c.service.localDate}T12:00:00Z`).getUTCDay() === 0
  const servesThisSunday = (pid: string) => sameService.has(pid) || sameDay.has(pid)
  const ok: Candidate[] = []
  const unavailable: Candidate[] = []
  const others: Candidate[] = []
  for (const p of data.value?.people ?? []) {
    if (inSlot.has(p.id)) continue
    if (q && !p.displayName.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').includes(q)) continue
    const l = loadById.value.get(p.id)
    const why: string[] = []
    const warn: string[] = []
    if (!l?.tasks) why.push('sem tarefa no mês')
    if (sameService.has(p.id)) why.push(`já serve neste culto: ${sameService.get(p.id)!.join(', ')}`)
    if (sameDay.has(p.id)) warn.push(`outro culto no mesmo dia: ${sameDay.get(p.id)!.join(', ')}`)
    if (isSunday && l && !l.restExempt && l.sundaysFree === 1 && !servesThisSunday(p.id)) warn.push('ficaria sem domingo livre')
    const load = l ? `${plural(l.tasks, 'tarefa', 'tarefas')}${l.restExempt ? '' : ` · ${plural(l.sundaysFree, 'domingo livre', 'domingos livres')}`}` : ''
    const cand: Candidate = { id: p.id, name: p.displayName, why, warn, load, score: (l?.tasks ?? 0) * 10 + warn.length * 25 - (l?.sundaysFree ?? 0) }
    const qualified = p.dutyIds.includes(c.slot.dutyId)
    if (!qualified) others.push(cand)
    else if (c.service.unavailablePersonIds.includes(p.id)) unavailable.push(cand)
    else ok.push(cand)
  }
  ok.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name, 'pt-BR'))
  others.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  return { ok, unavailable, others }
})
const full = computed(() => (current.value ? filled(current.value.slot) >= current.value.slot.requiredCount : false))

async function choose(personId: string, kind: 'ok' | 'unavailable' | 'exception') {
  if (replacing.value) {
    pending.value = { personId, kind: 'replace' }
    return
  }
  if (kind !== 'ok') {
    pending.value = { personId, kind: kind === 'unavailable' ? 'unavailable' : 'exception' }
    return
  }
  await assign(personId)
}
async function assign(personId: string, extra: Record<string, string> = {}) {
  if (!current.value) return
  working.value = true
  try {
    await capi(`/slots/${current.value.slot.id}/assignments`, { method: 'POST', body: { personId, notifyNow: notifyNow.value, ...extra } })
    toast.ok(`${personById.value.get(personId)?.displayName} escalado(a) em ${current.value.duty.name}.`)
    pending.value = null
    reason.value = ''
    await refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    working.value = false
  }
}
async function confirmPending() {
  const p = pending.value
  if (!p || reason.value.trim().length < 3) return
  if (p.kind === 'replace' && replacing.value) {
    working.value = true
    try {
      await capi(`/assignments/${replacing.value.id}/reassign`, { method: 'POST', body: { personId: p.personId, reason: reason.value, notifyNow: notifyNow.value } })
      toast.ok(`${replacing.value.personName} substituído(a) por ${personById.value.get(p.personId)?.displayName}.`)
      replacing.value = null
      pending.value = null
      reason.value = ''
      await refresh()
    } catch (e) {
      toast.error(e)
    } finally {
      working.value = false
    }
    return
  }
  await assign(p.personId, p.kind === 'unavailable' ? { overrideUnavailableReason: reason.value } : { exceptionReason: reason.value })
}
async function removeA(a: EditorAssignment) {
  working.value = true
  try {
    await capi(`/assignments/${a.id}`, { method: 'DELETE', body: { notifyNow: notifyNow.value } })
    toast.ok(`${a.personName} retirado(a).`)
    await refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    working.value = false
  }
}

// ---------------------------------------------------------------- publicação
const publishing = ref(false)
const pubForm = reactive({ notifyNow: 'no', justification: '' })
const scheduledPeople = computed(() => new Set(activeServices.value.flatMap((s) => s.slots.flatMap((sl) => sl.assignments.filter((a) => a.status !== 'declined').map((a) => a.personId)))).size)
async function publish() {
  try {
    const r = await capi<{ version: number, notified: { queued: number, blocked: number } }>(`/schedule/${month.value}/publish`, {
      method: 'POST', body: { notifyNow: pubForm.notifyNow === 'yes', justification: pubForm.justification || null },
    })
    toast.ok(`Escala publicada (versão ${r.version}).${pubForm.notifyNow === 'yes' ? ` Aviso para ${r.notified.queued} pessoas${r.notified.blocked ? `; ${r.notified.blocked} sem WhatsApp autorizado` : ''}.` : ''}`)
    publishing.value = false
    pubForm.justification = ''
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}

// ---------------------------------------------------------------- histórico
interface Version { version: number, kind: string, notifyNow: boolean, justification: string | null, createdAt: string, author: string | null, alertCount: number }
const history = ref<Version[] | null>(null)
const historyOpen = computed({ get: () => history.value !== null, set: (v) => { if (!v) history.value = null } })
async function showHistory() {
  const r = await capi<{ versions: Version[] }>(`/schedule/${month.value}/history`)
  history.value = r.versions
}
const KIND: Record<string, string> = { publish: 'Publicação', change: 'Alteração', swap: 'Troca entre voluntários', exception: 'Designação excepcional', response: 'Resposta' }
const showLoads = ref(false)
const openGroup = ref<string | null>(null)
const vacanciesByService = computed(() => activeServices.value.filter((sv) => sv.status !== 'cancelled').map((sv) => {
  const slots = sv.slots.filter((sl) => filled(sl) < sl.requiredCount)
  return { service: sv, slots, missing: slots.reduce((n, sl) => n + sl.requiredCount - filled(sl), 0) }
}).filter((v) => v.slots.length))
const vacancyTotal = computed(() => vacanciesByService.value.reduce((n, v) => n + v.missing, 0))
function openSlotById(slotId: string) {
  for (const sv of activeServices.value) {
    const sl = sv.slots.find((x) => x.id === slotId)
    if (sl) return openSlot(sv, sl)
  }
}
</script>

<template>
  <div class="page page--wide">
    <div class="page-head">
      <p class="kicker">
        Mês a mês
      </p>
      <div class="row row--between">
        <h1>Escala de {{ monthName(month) }}</h1>
        <MonthSwitch v-model="month" />
      </div>
      <p
        v-if="data"
        class="lede"
      >
        <template v-if="published">
          Publicada · versão {{ data.version }}<template v-if="data.publishedAt">
            · {{ dateTime(data.publishedAt, tz) }}
          </template>. Mudanças valem na hora e geram nova versão; quem já recebeu lembrete recebe correção automática.
        </template>
        <template v-else>
          Rascunho: só a coordenação vê. Toque em uma célula para escalar.
        </template>
      </p>
      <div class="row actions no-print">
        <button
          type="button"
          class="btn btn--primary"
          :disabled="!activeServices.length"
          @click="publishing = true"
        >
          <Icon name="send" /> {{ published ? 'Publicar nova versão' : 'Publicar escala' }}
        </button>
        <button
          v-if="published"
          type="button"
          class="btn"
          @click="showHistory"
        >
          Histórico de versões
        </button>
        <NuxtLink
          class="btn btn--quiet"
          :to="link(`/escala/${month}`)"
        >Ver como voluntário</NuxtLink>
        <button
          type="button"
          class="btn btn--quiet"
          onclick="window.print()"
        >
          <Icon name="print" /> Imprimir
        </button>
      </div>
    </div>

    <EmptyState
      v-if="data && !activeServices.length"
      :title="`Nenhum culto em ${monthName(month)}`"
      text="Cadastre os cultos do mês para montar a escala."
    >
      <NuxtLink
        class="btn btn--primary"
        :to="link(`/coordenacao/cultos/${month}`)"
      >Cadastrar cultos</NuxtLink>
    </EmptyState>

    <template v-else-if="data">
      <section
        class="no-print"
        aria-labelledby="alerts-title"
        style="margin-bottom:1.25rem"
      >
        <h2
          id="alerts-title"
          class="sr-only"
        >
          Antes de publicar
        </h2>
        <p
          v-if="!grouped.length"
          class="notice notice--ok"
        >
          Nenhum alerta. Tudo pronto para publicar.
        </p>
        <div
          v-else
          class="row"
          style="gap:.35rem 1.25rem;border-top:1.5px solid var(--ink);border-bottom:1px solid var(--rule);padding:.6rem 0"
        >
          <span class="kicker">Antes de publicar</span>
          <button
            v-for="g in grouped"
            :key="g.type"
            type="button"
            class="btn btn--quiet btn--small"
            :aria-expanded="openGroup === g.type"
            :style="`color:var(--${g.tone === 'info' ? 'info' : g.tone});padding-left:0;padding-right:0`"
            @click="openGroup = openGroup === g.type ? null : g.type"
          >
            <strong class="num">{{ g.type === 'vacancy' ? vacancyTotal : g.items.length }}</strong>&nbsp;{{ g.title.toLowerCase() }}
          </button>
          <span class="spacer" />
          <button
            type="button"
            class="btn btn--quiet btn--small"
            @click="showLoads = true"
          >
            Carga por pessoa
          </button>
        </div>
        <div
          v-if="openGroup"
          class="notice"
          :class="openGroup === 'vacancy' || grouped.find((g) => g.type === openGroup)?.tone === 'no' ? 'notice--no' : grouped.find((g) => g.type === openGroup)?.tone === 'wait' ? 'notice--wait' : ''"
          style="margin-top:.75rem"
        >
          <template v-if="openGroup === 'vacancy'">
            <ul class="lines lines--tight">
              <li
                v-for="v in vacanciesByService"
                :key="v.service.id"
              >
                <strong>{{ longDate(v.service.startsAt, tz) }}</strong> <span class="muted">· {{ plural(v.missing, 'vaga', 'vagas') }}</span>
                <span style="display:block">
                  <template
                    v-for="(sl, i) in v.slots"
                    :key="sl.id"
                  ><button
                    type="button"
                    class="btn btn--quiet btn--small"
                    style="padding:0 .1rem;min-height:0"
                    @click="openSlot(v.service, sl)"
                  >{{ dutyById.get(sl.dutyId)?.name }}</button><template v-if="i < v.slots.length - 1">, </template></template>
                </span>
              </li>
            </ul>
          </template>
          <ul
            v-else
            class="lines lines--tight"
          >
            <li
              v-for="(a, i) in grouped.find((g) => g.type === openGroup)?.items ?? []"
              :key="i"
            >
              <button
                v-if="a.slotId"
                type="button"
                class="btn btn--quiet"
                style="padding:0;min-height:0;text-align:left;color:inherit;font-weight:400"
                @click="openSlotById(a.slotId)"
              >
                {{ a.message }}
              </button>
              <span v-else>{{ a.message }}</span>
            </li>
          </ul>
          <p
            class="small muted"
            style="margin-top:.5rem"
          >
            Nenhum alerta impede a publicação. A folga é meta de cuidado; pastores ficam fora dela.
          </p>
        </div>
      </section>
      <div>
        <!-- Desktop: grade funções × cultos -->
        <div class="only-wide grid-wrap">
          <table class="grid">
            <caption class="sr-only">
              Escala de {{ monthLabel(month) }}. Cada célula abre a escolha de pessoas.
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  Função
                </th>
                <th
                  v-for="s in activeServices"
                  :key="s.id"
                  scope="col"
                  class="col-date"
                >
                  <div class="w">
                    {{ weekdayShort(s.startsAt, tz) }} · {{ time(s.startsAt, tz) }}
                  </div>
                  <div class="d">
                    {{ dayNumber(s.startsAt, tz) }} <span
                      class="small muted"
                      style="font-family:var(--sans)"
                    >{{ monthShort(s.startsAt, tz) }}</span>
                  </div>
                  <div
                    v-if="s.kind !== 'regular' || s.status === 'cancelled'"
                    class="small"
                    :style="s.status === 'cancelled' ? 'color:var(--no)' : 'color:var(--ink-3)'"
                  >
                    {{ s.status === 'cancelled' ? 'cancelado' : s.title }}
                  </div>
                  <div
                    v-if="s.unavailablePersonIds.length"
                    class="small muted"
                  >
                    {{ plural(s.unavailablePersonIds.length, 'indisponível', 'indisponíveis') }}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              <template
                v-for="g in rows"
                :key="g.ministry"
              >
                <tr class="ministry-row">
                  <th
                    scope="rowgroup"
                    :colspan="activeServices.length + 1"
                  >
                    {{ g.ministry }}
                  </th>
                </tr>
                <tr
                  v-for="d in g.duties"
                  :key="d.id"
                >
                  <th scope="row">
                    {{ d.name }}
                  </th>
                  <td
                    v-for="s in activeServices"
                    :key="s.id"
                  >
                    <button
                      v-if="slotFor(s, d.id) && s.status !== 'cancelled'"
                      type="button"
                      class="cell"
                      :class="cellClass(s, slotFor(s, d.id))"
                      :aria-label="`${d.name}, ${longDate(s.startsAt, tz)}: ${slotFor(s, d.id)!.assignments.map((a) => a.personName).join(', ') || 'vaga aberta'}`"
                      @click="openSlot(s, slotFor(s, d.id))"
                    >
                      <span
                        v-for="a in slotFor(s, d.id)!.assignments"
                        :key="a.id"
                        class="cell__person"
                        :style="a.status === 'declined' ? 'text-decoration:line-through;color:var(--ink-3)' : ''"
                      >
                        <StatusMark
                          :status="a.status"
                          short
                        />
                        {{ a.personName }}
                        <Icon
                          v-if="assignmentFlags(a).unavailable || assignmentFlags(a).clash || assignmentFlags(a).notQualified"
                          name="alert"
                          style="color:var(--no)"
                          :label="assignmentFlags(a).unavailable ? 'informou que não pode' : assignmentFlags(a).clash ? 'choque de horário' : 'sem habilitação'"
                        />
                      </span>
                      <span
                        v-if="filled(slotFor(s, d.id)!) < slotFor(s, d.id)!.requiredCount"
                        class="cell__need"
                      >
                        {{ slotFor(s, d.id)!.assignments.length ? `falta ${slotFor(s, d.id)!.requiredCount - filled(slotFor(s, d.id)!)}` : 'escolher' }}
                      </span>
                    </button>
                    <span
                      v-else
                      class="cell cell--na"
                      aria-label="sem este posto"
                    >&nbsp;</span>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <!-- Celular: um culto por vez -->
        <div class="only-narrow">
          <section
            v-for="s in activeServices"
            :key="s.id"
            class="section"
            style="margin-top:1.5rem"
          >
            <div class="section-head">
              <h2>{{ longDate(s.startsAt, tz) }}</h2>
              <span class="small ink-2">{{ time(s.startsAt, tz) }}{{ s.status === 'cancelled' ? ' · cancelado' : '' }}</span>
            </div>
            <ul
              v-if="s.status !== 'cancelled'"
              class="lines"
            >
              <li
                v-for="sl in s.slots"
                :key="sl.id"
                style="padding:0"
              >
                <button
                  type="button"
                  class="cell"
                  :class="cellClass(s, sl)"
                  @click="openSlot(s, sl)"
                >
                  <span
                    class="row row--between"
                    style="align-items:baseline"
                  >
                    <strong>{{ dutyById.get(sl.dutyId)?.name }}</strong>
                    <span
                      v-if="filled(sl) < sl.requiredCount"
                      class="cell__need"
                    >falta {{ sl.requiredCount - filled(sl) }}</span>
                  </span>
                  <span
                    v-for="a in sl.assignments"
                    :key="a.id"
                    class="cell__person"
                  ><StatusMark
                    :status="a.status"
                    short
                  /> {{ a.personName }}</span>
                </button>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </template>

    <Sheet
      v-model:open="showLoads"
      title="Carga por pessoa"
    >
      <p class="ink-2">
        Quantas tarefas cada pessoa tem no mês e quantos domingos ficam livres. Não é pontuação: é para distribuir com cuidado.
      </p>
      <table
        v-if="data"
        class="table"
        style="margin-top:1rem"
      >
        <thead>
          <tr>
            <th scope="col">
              Pessoa
            </th><th scope="col">
              Tarefas
            </th><th scope="col">
              Dias
            </th><th scope="col">
              Domingos livres
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="l in [...data.loads].sort((a, b) => b.tasks - a.tasks || a.displayName.localeCompare(b.displayName))"
            :key="l.personId"
          >
            <th
              scope="row"
              style="font-weight:600"
            >
              {{ l.displayName }}
            </th>
            <td class="num">
              {{ l.tasks }}
            </td>
            <td class="num">
              {{ l.daysServed }}
            </td>
            <td
              class="num"
              :style="!l.restExempt && l.sundaysFree === 0 ? 'color:var(--wait);font-weight:700' : ''"
            >
              {{ l.restExempt ? 'fora da meta' : l.sundaysFree }}
            </td>
          </tr>
        </tbody>
      </table>
    </Sheet>

    <!-- Escolha de pessoas para a vaga -->
    <Sheet
      v-model:open="sheetOpen"
      :title="current ? `${current.duty.name} · ${shortDate(current.service.startsAt, tz)}` : ''"
      wide
    >
      <template v-if="current">
        <p class="ink-2">
          {{ longDate(current.service.startsAt, tz) }}, {{ current.service.title }} às {{ current.service.time.replace(':', 'h') }} · {{ plural(current.slot.requiredCount, 'pessoa', 'pessoas') }} nesta função
        </p>

        <ul
          v-if="current.slot.assignments.length"
          class="lines"
          style="margin-top:1rem"
        >
          <li
            v-for="a in current.slot.assignments"
            :key="a.id"
            class="line"
          >
            <span class="line__main">
              <span class="line__title">{{ a.personName }}</span> <StatusMark :status="a.status" />
              <span
                v-if="a.exceptional"
                class="line__sub"
                style="display:block"
              >Designação excepcional: {{ a.exceptionReason }}</span>
              <span
                v-for="al in (alertsByAssignment.get(a.id) ?? []).filter((x) => x.severity === 'strong')"
                :key="al.message"
                class="small"
                style="display:block;color:var(--no)"
              >{{ al.message }}</span>
            </span>
            <span
              class="row"
              style="gap:.35rem"
            >
              <button
                type="button"
                class="btn btn--small"
                :aria-pressed="replacing?.id === a.id"
                @click="replacing = replacing?.id === a.id ? null : a; pending = null"
              >Substituir</button>
              <button
                type="button"
                class="btn btn--small btn--no"
                :disabled="working"
                @click="removeA(a)"
              >Retirar</button>
            </span>
          </li>
        </ul>

        <div
          v-if="replacing"
          class="notice notice--wait"
          style="margin-top:1rem"
        >
          <p>Escolha quem assume no lugar de <strong>{{ replacing.personName }}</strong>. A troca fica registrada com o motivo e a confirmação volta a pendente.</p>
        </div>

        <template v-if="!full || replacing">
          <div
            class="field"
            style="margin-top:1.25rem"
          >
            <label
              class="field__label"
              for="pick-search"
            >{{ replacing ? 'Substituir por' : 'Escolher pessoa' }}</label>
            <input
              id="pick-search"
              v-model="search"
              class="input"
              type="search"
              placeholder="Buscar pelo nome"
              autocomplete="off"
            >
          </div>

          <div
            v-if="pending"
            class="notice"
            :class="pending.kind === 'replace' ? 'notice--accent' : 'notice--wait'"
            style="margin-top:1rem"
          >
            <h3>
              {{ pending.kind === 'unavailable' ? `${personById.get(pending.personId)?.displayName} informou que não pode neste culto` : pending.kind === 'exception' ? `${personById.get(pending.personId)?.displayName} não é habilitado(a) para ${current.duty.name}` : `Substituir por ${personById.get(pending.personId)?.displayName}` }}
            </h3>
            <label
              class="field"
              style="margin-top:.5rem"
            >
              <span class="field__label">{{ pending.kind === 'replace' ? 'Motivo da troca' : 'Justificativa (fica registrada)' }}</span>
              <input
                v-model="reason"
                class="input"
                :placeholder="pending.kind === 'exception' ? 'Ex.: pregação de testemunho combinada com os pastores' : 'Ex.: combinado por telefone'"
              >
            </label>
            <div class="row">
              <button
                type="button"
                class="btn btn--primary btn--small"
                :disabled="reason.trim().length < 3 || working"
                @click="confirmPending"
              >
                Confirmar
              </button>
              <button
                type="button"
                class="btn btn--quiet btn--small"
                @click="pending = null"
              >
                Voltar
              </button>
            </div>
          </div>

          <p
            class="kicker"
            style="margin-top:1.25rem"
          >
            Habilitados e livres
          </p>
          <div>
            <button
              v-for="c in candidates.ok"
              :key="c.id"
              type="button"
              class="pick"
              :disabled="working"
              @click="choose(c.id, 'ok')"
            >
              <span>
                <span class="pick__name">{{ c.name }}</span>
                <span
                  v-if="c.why.length"
                  class="pick__why"
                  style="display:block"
                >{{ c.why.join(' · ') }}</span>
                <span
                  v-for="w in c.warn"
                  :key="w"
                  class="pick__why"
                  style="display:block;color:var(--wait)"
                ><Icon
                  name="alert"
                  style="width:.9rem;height:.9rem;vertical-align:-.1em"
                /> {{ w }}</span>
              </span>
              <span class="pick__load">{{ c.load }}</span>
            </button>
            <p
              v-if="!candidates.ok.length"
              class="muted small"
              style="padding:.5rem 0"
            >
              Ninguém habilitado e livre{{ search ? ' com esse nome' : '' }}.
            </p>
          </div>

          <template v-if="candidates.unavailable.length">
            <p
              class="kicker"
              style="margin-top:1.25rem"
            >
              Informaram que não podem
            </p>
            <button
              v-for="c in candidates.unavailable"
              :key="c.id"
              type="button"
              class="pick"
              aria-describedby="unavail-hint"
              @click="choose(c.id, 'unavailable')"
            >
              <span><span class="pick__name">{{ c.name }}</span><span
                class="pick__why"
                style="display:block;color:var(--no)"
              >indisponível neste culto</span></span>
              <span class="pick__load">{{ c.load }}</span>
            </button>
            <p
              id="unavail-hint"
              class="small muted"
            >
              Escalar alguém indisponível exige justificativa.
            </p>
          </template>

          <details
            v-if="candidates.others.length"
            style="margin-top:1.25rem"
          >
            <summary
              class="kicker"
              style="cursor:pointer"
            >
              Designação excepcional — sem habilitação ({{ candidates.others.length }})
            </summary>
            <button
              v-for="c in candidates.others"
              :key="c.id"
              type="button"
              class="pick"
              @click="choose(c.id, 'exception')"
            >
              <span><span class="pick__name">{{ c.name }}</span><span
                v-if="c.warn.length"
                class="pick__why"
                style="display:block"
              >{{ c.warn.join(' · ') }}</span></span>
              <span class="pick__load">{{ c.load }}</span>
            </button>
          </details>
        </template>
        <p
          v-else
          class="notice notice--ok"
          style="margin-top:1rem"
        >
          Vaga completa. Para incluir mais alguém, aumente a quantidade do posto em Cultos.
        </p>
      </template>
      <template #foot>
        <label
          v-if="published"
          class="check"
          style="margin-right:auto;padding:0"
        >
          <input
            v-model="notifyNow"
            type="checkbox"
          >
          <span class="check__text small">Avisar agora os afetados pelo WhatsApp</span>
        </label>
        <button
          type="button"
          class="btn"
          @click="closeSheet"
        >
          Pronto
        </button>
      </template>
    </Sheet>

    <!-- Publicação -->
    <Sheet
      v-model:open="publishing"
      :title="published ? `Publicar nova versão de ${monthName(month)}` : `Publicar a escala de ${monthName(month)}`"
    >
      <template v-if="data">
        <p
          v-if="!grouped.length"
          class="notice notice--ok"
        >
          Sem alertas.
        </p>
        <div
          v-else
          class="notice"
          :class="strongCount ? 'notice--wait' : ''"
        >
          <h3>{{ strongCount ? 'Há pontos em aberto' : 'Alguns sinais para revisar' }}</h3>
          <p>{{ grouped.map((g) => `${g.items.length} ${g.title.toLowerCase()}`).join(' · ') }}</p>
          <p class="small">
            Você pode publicar assim mesmo. Se quiser, registre o porquê.
          </p>
        </div>
        <label
          class="field"
          style="margin-top:1rem"
        ><span class="field__label">Observação da publicação (opcional)</span><input
          v-model="pubForm.justification"
          class="input"
          placeholder="Ex.: Louvor do dia 11 será definido no domingo"
        ></label>
        <fieldset style="margin-top:1.25rem">
          <legend>Avisar agora pelo WhatsApp?</legend>
          <div class="choice-list">
            <label class="check"><input
              v-model="pubForm.notifyNow"
              type="radio"
              value="yes"
            ><span class="check__text"><strong>Sim, avisar as {{ scheduledPeople }} pessoas escaladas</strong><span
              class="small muted"
              style="display:block"
            >Cada uma recebe suas tarefas do mês e o link para confirmar.</span></span></label>
            <label class="check"><input
              v-model="pubForm.notifyNow"
              type="radio"
              value="no"
            ><span class="check__text"><strong>Não avisar agora</strong><span
              class="small muted"
              style="display:block"
            >A escala fica visível no app. O lembrete semanal segue normalmente.</span></span></label>
          </div>
        </fieldset>
      </template>
      <template #foot>
        <button
          type="button"
          class="btn"
          @click="publishing = false"
        >
          Voltar
        </button>
        <button
          type="button"
          class="btn btn--primary"
          @click="publish"
        >
          {{ published ? 'Publicar nova versão' : 'Publicar' }}
        </button>
      </template>
    </Sheet>

    <Sheet
      v-model:open="historyOpen"
      :title="`Versões de ${monthName(month)}`"
    >
      <ul class="lines">
        <li
          v-for="v in history ?? []"
          :key="v.version"
        >
          <p><strong>Versão {{ v.version }}</strong> · {{ KIND[v.kind] ?? v.kind }}</p>
          <p class="small ink-2">
            {{ dateTime(v.createdAt, tz) }}{{ v.author ? ` · ${v.author}` : '' }}{{ v.notifyNow ? ' · com aviso imediato' : '' }}
          </p>
          <p
            v-if="v.justification"
            class="small"
          >
            {{ v.justification }}
          </p>
        </li>
      </ul>
    </Sheet>
  </div>
</template>
