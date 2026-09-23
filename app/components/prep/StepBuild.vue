<script setup lang="ts">
import type { EditorService, EditorSlot, ScheduleEditor } from '~/types'

// Passo 3: montar a escala culto a culto, função a função, com sugestões de quem está
// livre, habilitado e com menos tarefas. Exceções pedem motivo (fica no histórico).
const props = defineProps<{ editor: ScheduleEditor, month: string, focus: string | null }>()
const emit = defineEmits<{ (e: 'refresh' | 'next'): void }>()
const { capi, tz } = useChurch()
const toast = useToast()

const services = computed(() => props.editor.services.filter((s) => s.status === 'scheduled'))
const dutyName = (id: string) => props.editor.duties.find((d) => d.id === id)?.name ?? ''
const dutyArrival = (sl: EditorSlot, s: EditorService) => (sl.arrivalAt ? `chega ${time(sl.arrivalAt, tz.value)}` : arrivalLabel(sl.dutyId, s))
function arrivalLabel(dutyId: string, s: EditorService) {
  const min = props.editor.duties.find((d) => d.id === dutyId)?.arrivalMinutesBefore
  return min ? `chega ${time(new Date(Date.parse(s.startsAt) - min * 60_000), tz.value)}` : 'horário a combinar'
}
const active = (sl: EditorSlot) => sl.assignments.filter((a) => a.status !== 'declined')
const filled = (sl: EditorSlot) => Math.min(active(sl).length, sl.requiredCount)
const isDone = (sl: EditorSlot) => active(sl).length >= sl.requiredCount
const svcReq = (s: EditorService) => s.slots.reduce((n, x) => n + x.requiredCount, 0)
const svcFilled = (s: EditorService) => s.slots.reduce((n, x) => n + filled(x), 0)
const isSunday = (s: EditorService) => new Date(`${s.localDate}T12:00:00Z`).getUTCDay() === 0

const curId = ref<string | null>(null)
const curDuty = ref<string | null>(null)
function pickService(id: string) {
  curId.value = id
  const s = services.value.find((x) => x.id === id)
  curDuty.value = s?.slots.find((x) => !isDone(x))?.id ?? null
}
watch(() => [props.focus, services.value.length] as const, () => {
  if (curId.value && services.value.some((s) => s.id === curId.value)) return
  const target = (props.focus && services.value.find((s) => s.id === props.focus)) || services.value.find((s) => svcFilled(s) < svcReq(s)) || services.value[0]
  if (target) pickService(target.id)
}, { immediate: true })
const cur = computed(() => services.value.find((s) => s.id === curId.value) ?? null)
const curDone = computed(() => Boolean(cur.value && cur.value.slots.length && cur.value.slots.every(isDone)))
const unavailableNames = computed(() => (cur.value?.unavailablePersonIds ?? []).map((id) => props.editor.people.find((p) => p.id === id)?.displayName).filter(Boolean) as string[])

// Sugestões: habilitado, livre, fora deste culto; menos tarefas no mês primeiro; avisa quem
// ficaria sem domingo livre (a folga é meta, não regra; pastores não entram no alerta).
const loadOf = (id: string) => props.editor.loads.find((l) => l.personId === id)
interface Cand { id: string, name: string, why: string, warn: string, score: number }
function candidatesFor(s: EditorService, sl: EditorSlot) {
  const inService = new Set(s.slots.flatMap((x) => active(x).map((a) => a.personId)))
  const sameDay = new Set(services.value.filter((o) => o.id !== s.id && o.localDate === s.localDate).flatMap((o) => o.slots.flatMap((x) => active(x).map((a) => a.personId))))
  const unav = new Set(s.unavailablePersonIds)
  const ok: Cand[] = []
  const unavailable: Cand[] = []
  const others: Cand[] = []
  for (const p of props.editor.people) {
    if (inService.has(p.id)) continue
    const load = loadOf(p.id)
    const tasks = load?.tasks ?? 0
    const exempt = load?.restExempt ?? p.roles.includes('pastor')
    const noRest = isSunday(s) && !exempt && (load?.sundaysFree ?? 99) <= 1
    const warn = noRest ? 'Ficaria sem domingo livre' : sameDay.has(p.id) ? 'Já serve em outro culto neste dia' : ''
    const c: Cand = {
      id: p.id,
      name: p.displayName,
      why: tasks === 0 ? `Ainda sem tarefa em ${monthName(props.month)}` : `${plural(tasks, 'tarefa', 'tarefas')} em ${monthName(props.month)}`,
      warn,
      score: tasks * 10 + (noRest ? 25 : 0) + (sameDay.has(p.id) ? 15 : 0),
    }
    if (!p.dutyIds.includes(sl.dutyId)) others.push(c)
    else if (unav.has(p.id)) unavailable.push(c)
    else ok.push(c)
  }
  ok.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name, 'pt-BR'))
  others.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  return { ok, unavailable, others }
}
const curSlot = computed(() => cur.value?.slots.find((x) => x.id === curDuty.value) ?? null)
const cands = computed(() => (cur.value && curSlot.value ? candidatesFor(cur.value, curSlot.value) : null))

const busy = ref(false)
async function assign(personId: string, reason?: { exceptionReason?: string, overrideUnavailableReason?: string }) {
  const s = cur.value
  const sl = allSlot.value ?? curSlot.value
  if (!s || !sl) return
  busy.value = true
  try {
    await capi(`/slots/${sl.id}/assignments`, { method: 'POST', body: { personId, notifyNow: false, ...reason } })
    const name = props.editor.people.find((p) => p.id === personId)?.displayName.split(' ')[0]
    toast.ok(`Pronto: ${name} em ${dutyName(sl.dutyId)}.`)
    allSlotId.value = null
    exception.value = null
    emit('refresh')
    // Avança para a próxima função sem gente quando esta completar.
    const remaining = sl.requiredCount - active(sl).length - 1
    if (remaining <= 0) curDuty.value = s.slots.find((x) => x.id !== sl.id && !isDone(x))?.id ?? null
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}
async function unassign(assignmentId: string, slotId: string) {
  try {
    await capi(`/assignments/${assignmentId}`, { method: 'DELETE', body: {} })
    curDuty.value = slotId
    emit('refresh')
  } catch (e) {
    toast.error(e)
  }
}
function skipDuty() {
  const s = cur.value
  if (!s) return
  const i = s.slots.findIndex((x) => x.id === curDuty.value)
  const next = s.slots.slice(i + 1).find((x) => !isDone(x)) ?? s.slots.find((x) => !isDone(x) && x.id !== curDuty.value)
  curDuty.value = next?.id ?? null
}
function nextService() {
  const i = services.value.findIndex((x) => x.id === curId.value)
  const n = services.value[i + 1]
  if (!n) {
    emit('next')
    return
  }
  pickService(n.id)
}

// Folha com todas as pessoas para uma função.
const allSlotId = ref<string | null>(null)
const allSlot = computed(() => cur.value?.slots.find((x) => x.id === allSlotId.value) ?? null)
const allOpen = computed({ get: () => Boolean(allSlotId.value), set: (v) => { if (!v) { allSlotId.value = null; exception.value = null } } })
const allCands = computed(() => (cur.value && allSlot.value ? candidatesFor(cur.value, allSlot.value) : null))
const exception = ref<{ id: string, name: string, kind: 'unav' | 'unqualified' } | null>(null)
const reason = ref('')
function askException(c: Cand, kind: 'unav' | 'unqualified') {
  exception.value = { id: c.id, name: c.name, kind }
  reason.value = ''
}
async function confirmException() {
  const e = exception.value
  if (!e || reason.value.trim().length < 3) {
    toast.error('Escreva o motivo em poucas palavras (fica registrado no histórico).')
    return
  }
  const r = reason.value.trim()
  const alsoUnavailable = Boolean(cur.value?.unavailablePersonIds.includes(e.id))
  await assign(e.id, e.kind === 'unav' ? { overrideUnavailableReason: r } : { exceptionReason: r, ...(alsoUnavailable ? { overrideUnavailableReason: r } : {}) })
}

// Resumo do mês.
const totalReq = computed(() => services.value.reduce((n, s) => n + svcReq(s), 0))
const totalFilled = computed(() => services.value.reduce((n, s) => n + svcFilled(s), 0))
const noRest = computed(() => props.editor.loads.filter((l) => !l.restExempt && l.sundaysServed > 0 && l.sundaysFree === 0).map((l) => l.displayName))
const withoutTask = computed(() => props.editor.people.filter((p) => p.dutyIds.length && !p.roles.includes('pastor') && !(loadOf(p.id)?.tasks)).map((p) => p.displayName))
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
</script>

<template>
  <div
    class="row"
    style="gap:20px;align-items:flex-start"
  >
    <div
      class="stack-md"
      style="flex:1 1 440px;min-width:0"
    >
      <div
        class="pills"
        role="group"
        aria-label="Cultos do mês"
      >
        <button
          v-for="s in services"
          :key="s.id"
          type="button"
          class="datepill"
          :aria-pressed="s.id === curId"
          @click="pickService(s.id)"
        >
          <span style="font-weight:800;font-size:15px"><span class="pill__wd">{{ weekdayShort(s.startsAt, tz) }}</span> {{ dayNumber(s.startsAt, tz) }}</span>
          <span class="datepill__bar"><span :style="{ width: `${pct(svcFilled(s), svcReq(s))}%` }" /></span>
        </button>
      </div>

      <template v-if="cur">
        <div
          class="card"
          style="border-radius:22px;padding:18px 18px 16px"
        >
          <div
            class="row"
            style="align-items:flex-start;gap:12px"
          >
            <div
              class="grow"
              style="min-width:200px"
            >
              <h2 style="font-size:22px">
                {{ cap(longDate(cur.startsAt, tz)) }}
              </h2>
              <p
                class="soft"
                style="margin-top:4px;font-size:15px"
              >
                {{ cur.title }} · {{ time(cur.startsAt, tz) }}
              </p>
            </div>
            <div style="text-align:right">
              <p style="font-weight:800;font-size:18px">
                {{ svcFilled(cur) }}<span
                  class="muted-2"
                  style="font-weight:700;font-size:14px;color:var(--muted-2)"
                > / {{ svcReq(cur) }} vagas</span>
              </p>
              <div
                class="bar bar--sm"
                style="width:120px;margin:6px 0 0 auto"
              >
                <span :style="{ width: `${pct(svcFilled(cur), svcReq(cur))}%` }" />
              </div>
            </div>
          </div>
          <p
            v-if="unavailableNames.length"
            class="note"
            style="margin-top:12px"
          >
            <Icon
              name="info"
              :weight="1.9"
              style="width:18px;height:18px;vertical-align:-4px;margin-right:6px"
            />Não podem neste dia: <strong>{{ unavailableNames.join(', ') }}</strong>
          </p>
        </div>

        <div
          v-if="curDone"
          class="panel panel--ok row"
          style="gap:14px"
        >
          <span
            class="mark mark--done"
            style="width:44px;height:44px"
          ><Icon
            name="check"
            :weight="2.4"
            style="width:22px;height:22px"
          /></span>
          <div
            class="grow"
            style="min-width:180px"
          >
            <p
              class="strong"
              style="color:var(--ok-ink);font-size:17px"
            >
              Este culto está completo!
            </p>
            <p style="color:var(--ok-text);font-size:14.5px;margin-top:2px">
              Toque em qualquer função abaixo se quiser trocar alguém.
            </p>
          </div>
          <button
            type="button"
            class="btn btn--ok btn--md"
            @click="nextService"
          >
            {{ services.at(-1)?.id === cur.id ? 'Revisar e publicar' : 'Próximo culto' }}<Icon
              name="arrow-right"
              :weight="2.2"
              style="width:18px;height:18px"
            />
          </button>
        </div>

        <ol
          class="stack-sm"
          style="list-style:none;margin:0;padding:0;gap:8px"
        >
          <li
            v-for="(sl, i) in cur.slots"
            :key="sl.id"
            class="duty"
            :class="{ 'duty--cur': sl.id === curDuty, 'duty--done': isDone(sl) && sl.id !== curDuty }"
          >
            <button
              type="button"
              class="duty__head"
              :aria-expanded="sl.id === curDuty"
              @click="curDuty = sl.id === curDuty ? null : sl.id"
            >
              <span
                class="mark"
                :class="isDone(sl) ? 'mark--done' : sl.id === curDuty ? 'mark--now' : ''"
                style="border:0;font-size:13px"
                :style="!isDone(sl) && sl.id !== curDuty ? 'background:var(--surface-4);color:var(--muted)' : ''"
              ><Icon
                v-if="isDone(sl)"
                name="check"
                :weight="2.6"
                style="width:15px;height:15px"
              /><template v-else>{{ i + 1 }}</template></span>
              <span class="grow">
                <span
                  class="row"
                  style="gap:8px"
                ><span style="font-weight:800;font-size:16px">{{ dutyName(sl.dutyId) }}</span><span
                  class="muted"
                  style="font-size:13px"
                >{{ plural(sl.requiredCount, 'pessoa', 'pessoas') }} · {{ dutyArrival(sl, cur) }}</span></span>
              </span>
              <span
                v-if="!isDone(sl)"
                class="tag tag--wait tag--lg"
              >{{ active(sl).length ? `falta ${sl.requiredCount - active(sl).length}` : 'escolher' }}</span>
            </button>
            <div
              v-if="sl.assignments.length"
              class="chips"
              style="padding:0 14px 12px 56px;margin-top:-6px"
            >
              <span
                v-for="a in sl.assignments"
                :key="a.id"
                class="person-tag"
                :style="a.status === 'declined' ? 'background:var(--no-wash);color:var(--no-ink)' : ''"
              >
                <span class="av av--sm">{{ initials(a.personName) }}</span>{{ a.personName }}<template v-if="a.status === 'declined'"> · não pode</template><template v-else-if="a.exceptional"> · exceção</template>
                <button
                  type="button"
                  class="xbtn"
                  :aria-label="`Tirar ${a.personName} de ${dutyName(sl.dutyId)}`"
                  @click="unassign(a.id, sl.id)"
                ><Icon
                  name="x"
                  :weight="2.2"
                /></button>
              </span>
            </div>
            <div
              v-if="sl.id === curDuty && cands"
              style="padding:2px 14px 14px;border-top:1px solid var(--line-2)"
            >
              <p
                class="row strong small"
                style="gap:6px;margin:12px 0 8px;color:var(--ink-2)"
              >
                <Icon
                  name="sparkle"
                  :weight="1.9"
                  style="width:18px;height:18px;color:var(--accent)"
                />Sugestões para você
              </p>
              <p
                v-if="!cands.ok.length"
                class="note"
                style="margin-bottom:10px;font-size:14.5px;padding:10px 12px"
              >
                Ninguém habilitado está livre neste dia. Em “Ver todas as pessoas” dá para escalar alguém como exceção.
              </p>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px">
                <button
                  v-for="c in cands.ok.slice(0, 3)"
                  :key="c.id"
                  type="button"
                  class="suggest"
                  :disabled="busy || isDone(sl)"
                  @click="assign(c.id)"
                >
                  <span
                    class="av av--lg"
                    style="width:40px;height:40px"
                  >{{ initials(c.name) }}</span>
                  <span><span
                    style="display:block;font-weight:800;font-size:15.5px"
                  >{{ c.name }}</span><span
                    class="soft"
                    style="display:block;font-size:13px;margin-top:2px"
                  >{{ c.why }}</span><span
                    v-if="c.warn"
                    style="display:block;font-size:12.5px;color:var(--wait);font-weight:700;margin-top:2px"
                  >{{ c.warn }}</span></span>
                </button>
              </div>
              <div
                class="row"
                style="gap:6px 14px;margin-top:10px"
              >
                <button
                  type="button"
                  class="link"
                  @click="allSlotId = sl.id"
                >
                  Ver todas as pessoas ({{ Math.max(0, cands.ok.length - 3) + cands.unavailable.length + cands.others.length }})
                </button>
                <button
                  type="button"
                  class="link link--muted"
                  @click="skipDuty"
                >
                  Deixar para depois
                </button>
              </div>
            </div>
          </li>
        </ol>
        <div
          v-if="!curDone"
          class="row"
          style="padding-top:4px"
        >
          <button
            type="button"
            class="btn btn--secondary btn--md"
            style="font-weight:800"
            @click="nextService"
          >
            {{ services.at(-1)?.id === cur.id ? 'Revisar e publicar' : 'Próximo culto' }}<Icon
              name="arrow-right"
              :weight="2.2"
              style="width:18px;height:18px"
            />
          </button>
        </div>
      </template>
    </div>

    <aside
      class="stack-md"
      style="flex:1 1 240px;max-width:320px;min-width:0"
    >
      <div class="card">
        <p
          class="muted strong xsmall"
        >
          {{ cap(monthName(month)) }} inteiro
        </p>
        <p style="margin-top:4px;font-weight:800;font-size:22px">
          {{ totalFilled }}<span style="color:var(--muted-2);font-weight:700;font-size:14px"> de {{ totalReq }} vagas preenchidas</span>
        </p>
        <div
          class="bar bar--sm"
          style="margin-top:8px"
        >
          <span :style="{ width: `${pct(totalFilled, totalReq)}%` }" />
        </div>
        <p
          v-if="noRest.length"
          class="note note--wait"
          style="margin-top:12px"
        >
          <strong>Sem domingo livre:</strong> {{ noRest.join(', ') }}. Vale revisar com carinho.
        </p>
        <p
          v-if="withoutTask.length"
          class="note"
          style="margin-top:12px;color:var(--ink-2)"
        >
          <strong>Ainda sem tarefa no mês:</strong> {{ withoutTask.join(', ') }}.
        </p>
        <button
          type="button"
          class="btn btn--dark btn--md btn--block"
          style="margin-top:14px"
          @click="emit('next')"
        >
          Revisar e publicar
        </button>
      </div>
    </aside>

    <Sheet
      v-model:open="allOpen"
      :title="allSlot && cur ? `${dutyName(allSlot.dutyId)} · ${weekdayShort(cur.startsAt, tz)} ${dayNumber(cur.startsAt, tz)}` : ''"
      :lede="`Todo mundo, em ordem de quem tem menos tarefas no mês.`"
    >
      <template v-if="allCands && !exception">
        <p
          class="caps"
          style="color:var(--ok);margin-bottom:6px"
        >
          Podem e são habilitados
        </p>
        <button
          v-for="c in allCands.ok"
          :key="c.id"
          type="button"
          class="listrow"
          style="padding:10px 4px;border-top:1px solid var(--line-2)"
          :disabled="busy"
          @click="assign(c.id)"
        >
          <span class="av">{{ initials(c.name) }}</span>
          <span class="grow"><span
            class="strong"
            style="display:block"
          >{{ c.name }}</span><span
            class="soft"
            style="display:block;font-size:13.5px"
          >{{ c.why }}</span><span
            v-if="c.warn"
            style="display:block;font-size:13px;color:var(--wait);font-weight:700"
          >{{ c.warn }}</span></span>
          <span
            class="strong"
            style="font-size:13.5px;color:var(--accent-deep)"
          >Escalar</span>
        </button>
        <p
          v-if="!allCands.ok.length"
          class="soft small"
          style="padding:8px 0"
        >
          Ninguém habilitado e livre.
        </p>
        <template v-if="allCands.unavailable.length">
          <p
            class="caps"
            style="color:var(--no);margin:18px 0 6px"
          >
            Avisaram que não podem
          </p>
          <button
            v-for="c in allCands.unavailable"
            :key="c.id"
            type="button"
            class="listrow"
            style="padding:10px 4px;border-top:1px solid var(--line-2)"
            @click="askException(c, 'unav')"
          >
            <span class="av av--no">{{ initials(c.name) }}</span>
            <span class="grow"><span
              class="strong"
              style="display:block"
            >{{ c.name }}</span><span
              style="display:block;font-size:13.5px;color:var(--no)"
            >Não pode neste culto · escalar só se combinar antes</span></span>
            <span
              class="strong muted"
              style="font-size:13.5px"
            >Mesmo assim</span>
          </button>
        </template>
        <details
          v-if="allCands.others.length"
          style="margin-top:18px"
        >
          <summary
            class="caps"
            style="cursor:pointer"
          >
            Sem habilitação nesta função (exceção) ›
          </summary>
          <button
            v-for="c in allCands.others"
            :key="c.id"
            type="button"
            class="listrow"
            style="padding:10px 4px;border-top:1px solid var(--line-2)"
            @click="askException(c, 'unqualified')"
          >
            <span class="av av--plain">{{ initials(c.name) }}</span>
            <span class="grow"><span
              class="strong"
              style="display:block"
            >{{ c.name }}</span><span
              class="soft"
              style="display:block;font-size:13.5px"
            >{{ c.why }}</span></span>
            <span
              class="strong muted"
              style="font-size:13.5px"
            >Exceção</span>
          </button>
        </details>
      </template>
      <form
        v-else-if="exception"
        class="stack-md"
        @submit.prevent="confirmException"
      >
        <p>
          <strong>{{ exception.name }}</strong> {{ exception.kind === 'unav' ? 'avisou que não pode neste culto.' : 'não está habilitado(a) para esta função.' }} Escreva o motivo — fica registrado no histórico da escala.
        </p>
        <input
          v-model="reason"
          class="input"
          maxlength="300"
          :placeholder="exception.kind === 'unav' ? 'Ex.: combinamos por telefone, vai conseguir vir' : 'Ex.: vai aprender acompanhando'"
          aria-label="Motivo"
        >
        <div class="row">
          <button
            class="btn grow"
            style="min-height:50px"
            :disabled="busy"
          >
            Escalar como exceção
          </button>
          <button
            type="button"
            class="btn btn--secondary"
            style="min-height:50px"
            @click="exception = null"
          >
            Voltar
          </button>
        </div>
      </form>
    </Sheet>
  </div>
</template>
