<script setup lang="ts">
useHead({ title: 'Indisponibilidade' })
const route = useRoute()
const router = useRouter()
const { capi, tz, link } = useChurch()
const toast = useToast()
const month = computed({
  get: () => String(route.params.month),
  set: (v: string) => router.replace(link(`/coordenacao/disponibilidade/${v}`)),
})

interface Dash {
  month: string
  monthLabel: string
  request: { id: string, status: string, sendAt: string, deadlineAt: string, sentAt: string | null } | null
  summary: { people: number, responded: number, silent: number }
  people: { personId: string, displayName: string, responded: boolean, submittedAt: string | null, updatedAt: string | null, source: string | null, changedAfterDeadline: boolean, unavailableServiceIds: string[], message: { status: string, blockedReason: string | null } | null }[]
  services: { id: string, title: string, startsAt: string, time: string, localDate: string, createdAfterRequest: boolean, unavailable: { personId: string, name: string }[] }[]
}
const { data, refresh } = await useAsyncData(() => `avail-dash-${route.params.slug}-${month.value}`, () => capi<Dash>(`/availability/${month.value}`), { watch: [month] })

// Sugestão de datas: normalmente no começo do mês; se o primeiro culto cair até o dia 7,
// antecipa para o dia 25 do mês anterior.
const firstService = computed(() => data.value?.services[0] ?? null)
function suggestion() {
  const first = firstService.value
  const early = first ? Number(first.localDate.slice(8, 10)) <= 7 : false
  const sendDate = early ? `${shiftMonth(month.value, -1)}-25` : `${month.value}-01`
  const deadlineDate = early ? `${shiftMonth(month.value, -1)}-28` : `${month.value}-05`
  return { sendDate, sendTime: '10:00', deadlineDate, deadlineTime: '22:00', early }
}
const form = reactive({ sendDate: '', sendTime: '10:00', deadlineDate: '', deadlineTime: '22:00' })
const editingRequest = ref(false)
watchEffect(() => {
  const r = data.value?.request
  if (r && r.status !== 'cancelled') {
    Object.assign(form, { sendDate: isoToLocalParts(r.sendAt, tz.value).date, sendTime: isoToLocalParts(r.sendAt, tz.value).time, deadlineDate: isoToLocalParts(r.deadlineAt, tz.value).date, deadlineTime: isoToLocalParts(r.deadlineAt, tz.value).time })
  } else {
    const s = suggestion()
    Object.assign(form, { sendDate: s.sendDate, sendTime: s.sendTime, deadlineDate: s.deadlineDate, deadlineTime: s.deadlineTime })
  }
})
const early = computed(() => suggestion().early)
async function schedule() {
  try {
    await capi(`/availability/${month.value}/request`, {
      method: 'PUT',
      body: { sendAt: zonedToIso(form.sendDate, form.sendTime, tz.value), deadlineAt: zonedToIso(form.deadlineDate, form.deadlineTime, tz.value) },
    })
    toast.ok('Pedido agendado. O trabalhador envia na hora marcada.')
    editingRequest.value = false
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}
async function sendNow() {
  try {
    if (!data.value?.request) await schedule()
    const r = await capi<{ queued: number, blocked: number }>(`/availability/${month.value}/send-now`, { method: 'POST' })
    toast.ok(`Pedido enviado: ${r.queued} na fila${r.blocked ? `, ${r.blocked} sem WhatsApp autorizado (avise pessoalmente)` : ''}.`)
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}
async function cancel() {
  try {
    await capi(`/availability/${month.value}/cancel`, { method: 'POST' })
    toast.ok('Envio cancelado.')
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}
const newServices = computed(() => (data.value?.services ?? []).filter((s) => s.createdAfterRequest))
async function notifyNew() {
  try {
    const r = await capi<{ services: number, queued: number }>(`/availability/${month.value}/notify-new`, { method: 'POST' })
    toast.ok(`Aviso sobre ${r.services === 1 ? 'o culto novo' : `${r.services} cultos novos`} enviado.`)
  } catch (e) {
    toast.error(e)
  }
}

const tab = ref<'todos' | 'silencio' | 'responderam'>('silencio')
const rows = computed(() => (data.value?.people ?? []).filter((p) => tab.value === 'todos' || (tab.value === 'silencio' ? !p.responded : p.responded)))
const serviceDate = computed(() => new Map((data.value?.services ?? []).map((s) => [s.id, shortDate(s.startsAt, tz.value)])))

// Resposta recebida por outro canal
const recording = ref<Dash['people'][number] | null>(null)
const recSet = ref<string[]>([])
const recNote = ref('')
function openRecord(p: Dash['people'][number]) {
  recording.value = p
  recSet.value = [...p.unavailableServiceIds]
  recNote.value = ''
}
const recOpen = computed({ get: () => Boolean(recording.value), set: (v) => { if (!v) recording.value = null } })
async function saveRecord() {
  if (!recording.value) return
  try {
    await capi(`/people/${recording.value.personId}/availability/${month.value}`, { method: 'PUT', body: { unavailableServiceIds: recSet.value, note: recNote.value || null } })
    toast.ok(`Resposta de ${recording.value.displayName} registrada.`)
    recording.value = null
    await refresh()
  } catch (e) {
    toast.error(e)
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
        <h1>Indisponibilidade</h1>
        <MonthSwitch v-model="month" />
      </div>
      <p class="lede">
        Cada pessoa recebe um link individual e marca no app os cultos em que não pode servir. Silêncio não é disponibilidade.
      </p>
    </div>

    <EmptyState
      v-if="!data?.services.length"
      :title="`Nenhum culto cadastrado em ${monthName(month)}`"
      text="Cadastre os cultos primeiro: a mensagem leva as pessoas a marcar cada um deles."
    >
      <NuxtLink
        class="btn btn--primary"
        :to="link(`/coordenacao/cultos/${month}`)"
      >Cadastrar cultos</NuxtLink>
    </EmptyState>

    <template v-else-if="data">
      <!-- Pedido -->
      <section
        class="notice"
        :class="data.request?.status === 'sent' ? 'notice--ok' : 'notice--accent'"
        style="margin-bottom:2rem"
      >
        <template v-if="data.request?.status === 'sent' && !editingRequest">
          <h3>Pedido enviado em {{ dateTime(data.request.sentAt!, tz) }}</h3>
          <p>Prazo: {{ longDate(data.request.deadlineAt, tz) }}, às {{ time(data.request.deadlineAt, tz) }}.</p>
          <div class="row">
            <button
              type="button"
              class="btn btn--small"
              @click="editingRequest = true"
            >
              Mudar prazo
            </button>
            <button
              v-if="newServices.length"
              type="button"
              class="btn btn--small btn--primary"
              @click="notifyNew"
            >
              Avisar sobre {{ newServices.length === 1 ? 'o culto novo' : `${newServices.length} cultos novos` }}
            </button>
          </div>
        </template>
        <template v-else-if="data.request?.status === 'scheduled' && !editingRequest">
          <h3>Envio agendado para {{ longDate(data.request.sendAt, tz) }}, às {{ time(data.request.sendAt, tz) }}</h3>
          <p>Prazo de resposta: {{ longDate(data.request.deadlineAt, tz) }}, às {{ time(data.request.deadlineAt, tz) }}.</p>
          <div class="row">
            <button
              type="button"
              class="btn btn--small btn--primary"
              @click="sendNow"
            >
              <Icon name="send" /> Enviar agora
            </button>
            <button
              type="button"
              class="btn btn--small"
              @click="editingRequest = true"
            >
              Alterar datas
            </button>
            <button
              type="button"
              class="btn btn--quiet btn--small"
              @click="cancel"
            >
              Cancelar envio
            </button>
          </div>
        </template>
        <form
          v-else
          @submit.prevent="schedule"
        >
          <h3>{{ data.request?.status === 'sent' ? 'Mudar prazo' : 'Quando pedir as indisponibilidades?' }}</h3>
          <p
            v-if="early && data.request?.status !== 'sent'"
            class="small"
          >
            O primeiro culto de {{ monthName(month) }} cai cedo ({{ longDate(firstService!.startsAt, tz) }}), então sugerimos enviar ainda no fim do mês anterior.
          </p>
          <div
            class="row"
            style="align-items:flex-end;margin-top:.75rem"
          >
            <template v-if="data.request?.status !== 'sent'">
              <label
                class="field"
                style="margin:0"
              ><span class="field__label">Enviar em</span><input
                v-model="form.sendDate"
                class="input"
                type="date"
                required
              ></label>
              <label
                class="field"
                style="margin:0"
              ><span class="field__label">às</span><input
                v-model="form.sendTime"
                class="input"
                type="time"
                required
                style="width:8rem"
              ></label>
            </template>
            <label
              class="field"
              style="margin:0"
            ><span class="field__label">Responder até</span><input
              v-model="form.deadlineDate"
              class="input"
              type="date"
              required
            ></label>
            <label
              class="field"
              style="margin:0"
            ><span class="field__label">às</span><input
              v-model="form.deadlineTime"
              class="input"
              type="time"
              required
              style="width:8rem"
            ></label>
          </div>
          <div class="row">
            <button class="btn btn--primary">
              {{ data.request?.status === 'sent' ? 'Salvar prazo' : 'Agendar envio' }}
            </button>
            <button
              v-if="data.request?.status !== 'sent'"
              type="button"
              class="btn"
              @click="sendNow"
            >
              <Icon name="send" /> Enviar agora
            </button>
            <button
              v-if="editingRequest"
              type="button"
              class="btn btn--quiet"
              @click="editingRequest = false"
            >
              Voltar
            </button>
          </div>
        </form>
      </section>

      <div class="split">
        <section>
          <div class="section-head">
            <h2>Respostas</h2>
            <div
              class="figures"
              style="margin:0;gap:1.5rem"
            >
              <div>
                <span
                  class="figure__n"
                  style="font-size:1.6rem"
                >{{ data.summary.responded }}</span> <span class="figure__l">responderam</span>
              </div>
              <div>
                <span
                  class="figure__n"
                  style="font-size:1.6rem;color:var(--wait)"
                >{{ data.summary.silent }}</span> <span class="figure__l">em silêncio</span>
              </div>
            </div>
          </div>
          <div
            class="row"
            role="group"
            aria-label="Mostrar"
            style="gap:.25rem;margin:.9rem 0"
          >
            <button
              v-for="[k, l] in [['silencio', 'Sem resposta'], ['responderam', 'Responderam'], ['todos', 'Todos']]"
              :key="k"
              type="button"
              class="btn btn--small"
              :class="{ 'btn--primary': tab === k }"
              :aria-pressed="tab === k"
              @click="tab = k as typeof tab"
            >
              {{ l }}
            </button>
          </div>
          <ul class="lines">
            <li
              v-for="p in rows"
              :key="p.personId"
              class="line"
            >
              <span class="line__main">
                <span class="line__title">{{ p.displayName }}</span>
                <span
                  class="line__sub"
                  style="display:block"
                >
                  <template v-if="p.responded">
                    Respondeu em {{ dateTime(p.updatedAt!, tz) }}{{ p.source === 'coordination' ? ' (registrado pela coordenação)' : '' }}{{ p.changedAfterDeadline ? ' · alterou depois do prazo' : '' }} —
                    <strong
                      v-if="p.unavailableServiceIds.length"
                      style="color:var(--no)"
                    >não pode em {{ p.unavailableServiceIds.map((id) => serviceDate.get(id)).join(', ') }}</strong>
                    <strong
                      v-else
                      style="color:var(--ok)"
                    >pode em todos</strong>
                  </template>
                  <template v-else>
                    Ainda não respondeu
                    <template v-if="p.message"> · mensagem: {{ MESSAGE_STATUS[p.message.status]?.label.toLowerCase() ?? p.message.status }}{{ p.message.blockedReason === 'no_consent' ? ' (sem autorização de WhatsApp)' : p.message.blockedReason === 'no_phone' ? ' (sem telefone)' : '' }}</template>
                  </template>
                </span>
              </span>
              <button
                type="button"
                class="btn btn--small"
                @click="openRecord(p)"
              >
                Registrar resposta
              </button>
            </li>
            <li
              v-if="!rows.length"
              class="muted"
            >
              {{ tab === 'silencio' ? 'Todos responderam.' : 'Ninguém aqui ainda.' }}
            </li>
          </ul>
        </section>
        <aside>
          <div class="section-head">
            <h2>Por culto</h2>
          </div>
          <ul class="lines">
            <li
              v-for="s in data.services"
              :key="s.id"
            >
              <p class="line__title">
                {{ longDate(s.startsAt, tz) }} <span class="muted small">{{ time(s.startsAt, tz) }}</span> <span
                  v-if="s.createdAfterRequest"
                  class="tag tag--info"
                >novo</span>
              </p>
              <p
                class="small"
                :class="s.unavailable.length ? '' : 'muted'"
              >
                {{ s.unavailable.length ? `Não podem: ${s.unavailable.map((u) => u.name).join(', ')}` : 'Ninguém indisponível até agora' }}
              </p>
            </li>
          </ul>
          <NuxtLink
            class="btn btn--primary btn--block"
            style="margin-top:1.25rem"
            :to="link(`/coordenacao/escalas/${month}`)"
          >Montar a escala <Icon name="arrow-right" /></NuxtLink>
        </aside>
      </div>
    </template>

    <Sheet
      v-model:open="recOpen"
      :title="recording ? `Resposta de ${recording.displayName}` : ''"
    >
      <p class="ink-2">
        Use quando a pessoa respondeu por outro canal. Fica registrado que foi a coordenação.
      </p>
      <fieldset style="margin-top:1rem">
        <legend>Não pode em</legend>
        <div class="choice-list">
          <label
            v-for="s in data?.services ?? []"
            :key="s.id"
            class="check"
          >
            <input
              v-model="recSet"
              type="checkbox"
              :value="s.id"
            >
            <span class="check__text">{{ longDate(s.startsAt, tz) }}, {{ s.title }} às {{ time(s.startsAt, tz) }}</span>
          </label>
        </div>
      </fieldset>
      <label
        class="field"
        style="margin-top:1rem"
      ><span class="field__label">Como respondeu</span><input
        v-model="recNote"
        class="input"
        placeholder="Ex.: por telefone no domingo"
      ></label>
      <template #foot>
        <button
          type="button"
          class="btn"
          @click="recording = null"
        >
          Cancelar
        </button>
        <button
          type="button"
          class="btn btn--primary"
          @click="saveRecord"
        >
          {{ recSet.length ? `Registrar: não pode em ${recSet.length}` : 'Registrar: pode em todos' }}
        </button>
      </template>
    </Sheet>
  </div>
</template>
