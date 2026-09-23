<script setup lang="ts">
// Passo 2: perguntar quem não pode. Silêncio não conta como "pode": quem não respondeu
// aparece à parte, com lembrete pelo WhatsApp ou registro feito pela coordenação.
const props = defineProps<{ month: string }>()
const emit = defineEmits<{ (e: 'next' | 'changed'): void }>()
const { capi, tz, churchName } = useChurch()
const toast = useToast()

interface PersonRow { personId: string, displayName: string, responded: boolean, updatedAt: string | null, source: string | null, unavailableServiceIds: string[], whatsapp: 'ok' | 'no_phone' | 'no_consent' }
interface Dashboard {
  request: { status: string, sendAt: string, deadlineAt: string, sentAt: string | null } | null
  templateBody: string
  link: string
  summary: { people: number, responded: number, silent: number }
  people: PersonRow[]
  services: { id: string, title: string, startsAt: string, time: string, createdAfterRequest: boolean }[]
}
const { data, refresh } = await useAsyncData(() => `prep-ask-${props.month}`, () => capi<Dashboard>(`/availability/${props.month}`), { watch: [() => props.month] })
const req = computed(() => (data.value?.request && data.value.request.status !== 'cancelled' ? data.value.request : null))
const editing = ref(false)
const state = computed(() => (!req.value || editing.value ? 'none' : req.value.status === 'scheduled' ? 'scheduled' : 'sent'))

// Sugestão de datas: envio amanhã às 10h; prazo uma semana depois (ou na véspera do
// primeiro culto, se ele vier antes).
const firstService = computed(() => data.value?.services[0]?.startsAt ?? null)
const form = reactive({ sendDate: '', sendTime: '10:00', deadlineDate: '', deadlineTime: '22:00' })
function suggest() {
  const r = req.value
  if (r) {
    Object.assign(form, { sendDate: localDateKey(r.sendAt, tz.value), sendTime: isoToLocalParts(r.sendAt, tz.value).time, deadlineDate: localDateKey(r.deadlineAt, tz.value), deadlineTime: isoToLocalParts(r.deadlineAt, tz.value).time })
    return
  }
  const tomorrow = localDateKey(new Date(Date.now() + 86400_000), tz.value)
  let deadline = localDateKey(new Date(Date.now() + 8 * 86400_000), tz.value)
  if (firstService.value) {
    const eve = localDateKey(new Date(Date.parse(firstService.value) - 86400_000), tz.value)
    if (eve < deadline && eve > tomorrow) deadline = eve
  }
  Object.assign(form, { sendDate: tomorrow, sendTime: '10:00', deadlineDate: deadline, deadlineTime: '22:00' })
}
watch(() => data.value?.request, suggest, { immediate: true })
const earlyHint = computed(() => {
  if (!firstService.value) return null
  const day = Number(localDateKey(firstService.value, tz.value).slice(8, 10))
  return day <= 7 ? `Sugestão: o primeiro culto cai no dia ${day}, então vale enviar ainda em ${monthName(shiftMonth(props.month, -1))}.` : null
})

const withWa = computed(() => (data.value?.people ?? []).filter((p) => p.whatsapp === 'ok'))
const withoutWa = computed(() => (data.value?.people ?? []).filter((p) => p.whatsapp !== 'ok'))
const preview = computed(() => {
  const d = data.value
  if (!d) return ''
  const name = (withWa.value[0]?.displayName ?? d.people[0]?.displayName ?? 'Maria').split(' ')[0]!
  const deadline = form.deadlineDate ? `${WEEKDAYS[new Date(`${form.deadlineDate}T12:00:00Z`).getUTCDay()]!.replace('-feira', '')}, ${form.deadlineDate.slice(8, 10)}/${form.deadlineDate.slice(5, 7)}, às ${hhmm(form.deadlineTime)}` : '…'
  const params = [name, monthName(props.month), churchName.value, deadline, d.link]
  return d.templateBody.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? '')
})

const busy = ref(false)
async function schedule(now = false) {
  busy.value = true
  try {
    const sendAt = now ? new Date().toISOString() : zonedToIso(form.sendDate, form.sendTime, tz.value)
    const deadlineAt = zonedToIso(form.deadlineDate, form.deadlineTime, tz.value)
    await capi(`/availability/${props.month}/request`, { method: 'PUT', body: { sendAt, deadlineAt } })
    if (now) {
      const r = await capi<{ queued: number, blocked: number }>(`/availability/${props.month}/send-now`, { method: 'POST' })
      toast.ok(r.blocked ? `Pedido enviado para ${plural(r.queued, 'pessoa', 'pessoas')}. ${r.blocked} sem WhatsApp autorizado: avise pessoalmente.` : `Pedido enviado para ${plural(r.queued, 'pessoa', 'pessoas')}.`)
    } else {
      toast.ok(`Pedido agendado para ${weekdayLong(sendAt, tz.value).replace('-feira', '')}, ${dayMonth(sendAt, tz.value)}, ${time(sendAt, tz.value)}.`)
    }
    editing.value = false
    await refresh()
    emit('changed')
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}
async function sendNowExisting() {
  busy.value = true
  try {
    const r = await capi<{ queued: number, blocked: number }>(`/availability/${props.month}/send-now`, { method: 'POST' })
    toast.ok(`Pedido enviado para ${plural(r.queued, 'pessoa', 'pessoas')}.${r.blocked ? ` ${r.blocked} sem WhatsApp autorizado: avise pessoalmente.` : ''}`)
    await refresh()
    emit('changed')
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}
async function remind() {
  try {
    const r = await capi<{ queued: number, blocked: number }>(`/availability/${props.month}/remind`, { method: 'POST' })
    toast.ok(r.queued ? `Lembrete enviado para ${plural(r.queued, 'pessoa', 'pessoas')}.` : 'Ninguém em silêncio recebe pelo WhatsApp: avise pessoalmente.')
  } catch (e) {
    toast.error(e)
  }
}
const newServices = computed(() => (data.value?.services ?? []).filter((s) => s.createdAfterRequest))
async function notifyNew() {
  try {
    const r = await capi<{ queued: number }>(`/availability/${props.month}/notify-new`, { method: 'POST' })
    toast.ok(`Aviso sobre os cultos novos para ${plural(r.queued, 'pessoa', 'pessoas')}.`)
  } catch (e) {
    toast.error(e)
  }
}

const silent = computed(() => (data.value?.people ?? []).filter((p) => !p.responded))
const responded = computed(() => (data.value?.people ?? []).filter((p) => p.responded))
const svcLabel = (id: string) => {
  const s = data.value?.services.find((x) => x.id === id)
  return s ? `${weekdayShort(s.startsAt, tz.value)} ${dayNumber(s.startsAt, tz.value)}` : ''
}
const silentSub = (p: PersonRow) => (p.whatsapp === 'no_phone' ? 'Sem telefone cadastrado' : p.whatsapp === 'no_consent' ? 'Sem WhatsApp autorizado — avise pessoalmente' : 'Recebeu a mensagem, ainda não respondeu')

// Resposta recebida por outro canal, registrada pela coordenação.
const recording = ref<PersonRow | null>(null)
const recordOpen = computed({ get: () => Boolean(recording.value), set: (v) => { if (!v) recording.value = null } })
const recMarks = ref<Set<string>>(new Set())
function openRecord(p: PersonRow) {
  recording.value = p
  recMarks.value = new Set(p.unavailableServiceIds)
}
function toggleRec(id: string) {
  const s = new Set(recMarks.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  recMarks.value = s
}
async function saveRecord() {
  const p = recording.value
  if (!p) return
  try {
    await capi(`/people/${p.personId}/availability/${props.month}`, { method: 'PUT', body: { unavailableServiceIds: [...recMarks.value] } })
    toast.ok(`Resposta de ${p.displayName.split(' ')[0]} registrada.`)
    recording.value = null
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}
const pct = computed(() => (data.value?.summary.people ? Math.round((data.value.summary.responded / data.value.summary.people) * 100) : 0))
const deadlineText = (iso: string) => `${weekdayLong(iso, tz.value).replace('-feira', '')}, ${dayMonth(iso, tz.value)}, ${time(iso, tz.value)}`
</script>

<template>
  <div
    v-if="data"
    class="stack-md w-720"
  >
    <template v-if="state === 'none'">
      <div>
        <h2 class="h2">
          Pergunte quem não pode em {{ monthName(month) }}
        </h2>
        <p class="lede">
          Cada pessoa recebe uma mensagem com um link e marca os cultos em que não pode. Silêncio não conta como “pode”.
        </p>
      </div>
      <div class="card">
        <p
          class="muted strong xsmall"
          style="margin-bottom:10px"
        >
          A mensagem que cada pessoa recebe
        </p>
        <p class="bubble">
          {{ preview }}
        </p>
      </div>
      <div class="grid-auto">
        <div class="card">
          <p
            class="strong"
            style="margin-bottom:8px"
          >
            Enviar em
          </p>
          <div
            class="row"
            style="flex-wrap:nowrap;gap:8px"
          >
            <input
              v-model="form.sendDate"
              type="date"
              class="input input--sm grow"
              aria-label="Dia do envio"
            >
            <input
              v-model="form.sendTime"
              type="time"
              class="input input--sm"
              style="width:104px"
              aria-label="Hora do envio"
            >
          </div>
          <p
            v-if="earlyHint"
            class="muted"
            style="margin-top:8px;font-size:13.5px"
          >
            {{ earlyHint }}
          </p>
        </div>
        <div class="card">
          <p
            class="strong"
            style="margin-bottom:8px"
          >
            Prazo para responder
          </p>
          <div
            class="row"
            style="flex-wrap:nowrap;gap:8px"
          >
            <input
              v-model="form.deadlineDate"
              type="date"
              class="input input--sm grow"
              aria-label="Dia do prazo"
            >
            <input
              v-model="form.deadlineTime"
              type="time"
              class="input input--sm"
              style="width:104px"
              aria-label="Hora do prazo"
            >
          </div>
          <p
            class="muted"
            style="margin-top:8px;font-size:13.5px"
          >
            Depois do prazo você ainda pode montar; quem responder tarde gera um aviso.
          </p>
        </div>
      </div>
      <div class="panel panel--soft">
        <p class="strong">
          {{ plural(withWa.length, 'pessoa recebe', 'pessoas recebem') }} pelo WhatsApp
        </p>
        <p
          v-if="withoutWa.length"
          style="margin-top:4px;color:var(--ink-2);font-size:14.5px"
        >
          <strong>{{ withoutWa.length }} ainda não {{ withoutWa.length === 1 ? 'autorizou' : 'autorizaram' }} o WhatsApp:</strong> {{ withoutWa.map((p) => p.displayName).join(', ') }}. Pergunte pessoalmente e registre a resposta aqui depois.
        </p>
      </div>
      <div class="row">
        <button
          type="button"
          class="btn"
          :disabled="busy"
          @click="schedule(false)"
        >
          Agendar envio
        </button>
        <button
          type="button"
          class="btn btn--secondary"
          :disabled="busy"
          @click="schedule(true)"
        >
          <Icon
            name="send"
            :weight="1.9"
            style="width:18px;height:18px"
          />Enviar agora
        </button>
        <button
          v-if="!req"
          type="button"
          class="link link--muted"
          style="font-size:14.5px;padding:8px 4px"
          @click="emit('next')"
        >
          Pular e montar sem perguntar
        </button>
        <button
          v-else
          type="button"
          class="link link--muted"
          style="font-size:14.5px;padding:8px 4px"
          @click="editing = false"
        >
          Cancelar
        </button>
      </div>
    </template>

    <template v-else-if="state === 'scheduled' && req">
      <div
        class="card"
        style="padding:18px"
      >
        <p class="muted strong xsmall">
          Agendado
        </p>
        <h2
          class="h3"
          style="margin-top:4px"
        >
          A pergunta sai {{ weekdayLong(req.sendAt, tz).replace('-feira', '') }}, {{ dayMonth(req.sendAt, tz) }}, às {{ time(req.sendAt, tz) }}
        </h2>
        <p
          class="soft"
          style="margin-top:4px"
        >
          Prazo para responder: {{ deadlineText(req.deadlineAt) }}. {{ plural(withWa.length, 'pessoa recebe', 'pessoas recebem') }} pelo WhatsApp.
        </p>
        <div
          class="row"
          style="gap:8px;margin-top:12px"
        >
          <button
            type="button"
            class="btn btn--md"
            :disabled="busy"
            @click="sendNowExisting"
          >
            Enviar agora
          </button>
          <button
            type="button"
            class="btn btn--secondary btn--md"
            @click="editing = true"
          >
            Alterar datas
          </button>
        </div>
      </div>
      <div class="row">
        <button
          type="button"
          class="btn btn--secondary"
          style="font-weight:800"
          @click="emit('next')"
        >
          Começar a montar enquanto espero<Icon
            name="arrow-right"
            :weight="2.2"
          />
        </button>
      </div>
    </template>

    <template v-else-if="req">
      <div
        class="card"
        style="padding:18px"
      >
        <div
          class="row"
          style="align-items:baseline"
        >
          <h2
            class="h2 grow"
          >
            {{ data.summary.responded }} de {{ data.summary.people }} responderam
          </h2>
          <span class="small muted">prazo: {{ deadlineText(req.deadlineAt) }}</span>
        </div>
        <div
          class="bar"
          style="margin-top:12px"
          role="progressbar"
          :aria-valuenow="pct"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <span :style="{ width: `${pct}%` }" />
        </div>
        <p
          class="soft"
          style="margin-top:10px;font-size:14.5px"
        >
          <template v-if="req.sentAt">
            Enviada em {{ shortDate(req.sentAt, tz) }}.
          </template> Pode montar enquanto as respostas chegam.
        </p>
      </div>
      <div
        v-if="newServices.length"
        class="panel panel--wait row"
        style="border-radius:18px"
      >
        <p class="grow">
          {{ plural(newServices.length, 'culto foi criado', 'cultos foram criados') }} depois do pedido: {{ newServices.map((s) => `${weekdayShort(s.startsAt, tz)} ${dayNumber(s.startsAt, tz)}`).join(', ') }}.
        </p>
        <button
          type="button"
          class="btn btn--white btn--sm"
          @click="notifyNew"
        >
          Avisar todos
        </button>
      </div>
      <div
        v-if="silent.length"
        class="card"
        style="padding:6px 18px 14px"
      >
        <div
          class="row"
          style="padding:12px 0 6px"
        >
          <p class="strong grow">
            Ainda em silêncio ({{ silent.length }})
          </p>
          <button
            type="button"
            class="btn btn--line btn--xs"
            @click="remind"
          >
            Lembrar pelo WhatsApp
          </button>
        </div>
        <div
          v-for="p in silent"
          :key="p.personId"
          class="row"
          style="flex-wrap:nowrap;gap:12px;padding:10px 0;border-top:1px solid var(--line-2)"
        >
          <span class="av av--plain">{{ initials(p.displayName) }}</span>
          <div class="grow">
            <p style="font-weight:700">
              {{ p.displayName }}
            </p>
            <p
              class="muted"
              style="font-size:13.5px"
            >
              {{ silentSub(p) }}
            </p>
          </div>
          <button
            type="button"
            class="btn btn--soft btn--xs"
            style="min-height:38px"
            @click="openRecord(p)"
          >
            Registrar resposta
          </button>
        </div>
      </div>
      <details class="card">
        <summary
          class="strong"
          style="cursor:pointer"
        >
          Quem já respondeu ({{ responded.length }})
        </summary>
        <div
          v-for="p in responded"
          :key="p.personId"
          class="row"
          style="flex-wrap:nowrap;gap:12px;padding:10px 0;border-top:1px solid var(--line-2);margin-top:8px"
        >
          <span class="av av--md">{{ initials(p.displayName) }}</span>
          <p
            class="grow"
            style="font-weight:700"
          >
            {{ p.displayName }}
          </p>
          <button
            type="button"
            class="link link--muted"
            style="font-size:13.5px;text-align:right"
            @click="openRecord(p)"
          >
            {{ p.unavailableServiceIds.length ? `Não pode: ${p.unavailableServiceIds.map(svcLabel).join(', ')}` : 'Pode em todos os cultos' }}
          </button>
        </div>
      </details>
      <div class="row">
        <button
          type="button"
          class="btn"
          @click="emit('next')"
        >
          Montar a escala<Icon
            name="arrow-right"
            :weight="2.2"
          />
        </button>
      </div>
    </template>

    <Sheet
      v-model:open="recordOpen"
      :title="recording ? `Resposta de ${recording.displayName.split(' ')[0]}` : ''"
    >
      <template v-if="recording">
        <p class="sheet__lede">
          Marque os cultos em que {{ recording.displayName.split(' ')[0] }} disse que não pode. Nada marcado = pode em todos.
        </p>
        <div class="stack-sm">
          <button
            v-for="s in data.services"
            :key="s.id"
            type="button"
            class="recrow"
            :aria-pressed="recMarks.has(s.id)"
            @click="toggleRec(s.id)"
          >
            <span
              class="strong"
              style="min-width:60px;text-transform:capitalize"
            >{{ weekdayShort(s.startsAt, tz) }} {{ dayNumber(s.startsAt, tz) }}</span>
            <span
              class="grow"
              style="font-size:14.5px"
            >{{ s.title }} · {{ hhmm(s.time) }}</span>
            <span
              v-if="recMarks.has(s.id)"
              class="strong xsmall"
            >não pode</span>
          </button>
        </div>
        <button
          type="button"
          class="btn btn--block"
          style="margin-top:16px;min-height:50px"
          @click="saveRecord"
        >
          Registrar resposta
        </button>
      </template>
    </Sheet>
  </div>
</template>
