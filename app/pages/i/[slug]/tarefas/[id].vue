<script setup lang="ts">
import type { Task } from '~/types'

useHead({ title: 'Tarefa' })
const route = useRoute()
const id = String(route.params.id)
const { capi, tz, link, info } = useChurch()
const toast = useToast()
interface Candidate { personId: string, displayName: string, available: boolean, problems: string[], monthTasks: number, month: string }
const { data, refresh } = await useAsyncData(`task-${id}`, async () => {
  const [tasks, candidates, history] = await Promise.all([
    capi<{ tasks: Task[] }>('/me/tasks?past=1'),
    capi<{ candidates: Candidate[] }>(`/assignments/${id}/candidates`).catch(() => ({ candidates: [] as Candidate[] })),
    capi<{ responses: { decision: string, channel: string, note: string | null, createdAt: string, personName: string }[] }>(`/assignments/${id}/history`).catch(() => ({ responses: [] })),
  ])
  return { task: tasks.tasks.find((t) => t.assignmentId === id) ?? null, candidates: candidates.candidates, history: history.responses }
})
const { respond, busy } = useRespond(refresh)
const task = computed(() => data.value?.task ?? null)
const isPast = computed(() => (task.value ? new Date(task.value.service.startsAt).getTime() < Date.now() : false))
const openSwap = computed(() => task.value?.openSwaps[0] ?? null)
const location = computed(() => task.value?.service.location ?? info.value?.church.defaultLocation ?? null)
const dateLabel = computed(() => (task.value ? `${longDate(task.value.service.startsAt, tz.value)} · ${time(task.value.service.startsAt, tz.value)}` : ''))

const declining = ref<Task | null>(null)
async function decline(note: string) {
  if (!declining.value) return
  await respond(declining.value, 'declined', note)
  declining.value = null
}

// Pedir para alguém assumir
const handoff = ref(false)
const chosen = ref<string | null>(null)
const note = ref('')
const sending = ref(false)
const available = computed(() => (data.value?.candidates ?? []).filter((c) => c.available))
const chosenName = computed(() => available.value.find((c) => c.personId === chosen.value)?.displayName ?? '')
function candSub(c: Candidate) {
  const m = monthName(c.month).toLowerCase()
  return c.monthTasks ? plural(c.monthTasks, `tarefa em ${m}`, `tarefas em ${m}`) : `Ainda sem tarefa em ${m}`
}
async function propose() {
  if (!chosen.value) return
  sending.value = true
  try {
    await capi(`/assignments/${id}/swaps`, { method: 'POST', body: { candidatePersonId: chosen.value, message: note.value || null } })
    toast.ok(`Pedido enviado para ${chosenName.value}. A troca vale quando a pessoa aceitar.`)
    handoff.value = false
    chosen.value = null
    note.value = ''
    await refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    sending.value = false
  }
}
async function cancelSwap(swapId: string) {
  try {
    await capi(`/swaps/${swapId}/cancel`, { method: 'POST' })
    toast.ok('Pedido cancelado.')
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}

const CHANNEL: Record<string, string> = { app: 'pelo app', coordination: 'pela coordenação', whatsapp: 'pelo WhatsApp' }
const history = computed(() => {
  const items = (data.value?.history ?? []).map((h) => ({
    text: `${h.personName} ${h.decision === 'confirmed' ? 'confirmou' : 'avisou que não pode'} ${CHANNEL[h.channel] ?? ''}`.trim() + (h.note ? ` — “${h.note}”` : ''),
    when: shortDate(h.createdAt, tz.value),
    at: h.createdAt,
    dot: h.decision === 'confirmed' ? 'var(--ok)' : 'var(--no)',
  }))
  for (const s of task.value?.openSwaps ?? []) items.push({ text: `Você pediu a ${s.candidateName} para assumir`, when: shortDate(s.createdAt, tz.value), at: s.createdAt, dot: '#2f5fa8' })
  return items.sort((a, b) => a.at.localeCompare(b.at))
})
</script>

<template>
  <section class="stack-md w-640">
    <template v-if="!task">
      <BackLink
        :to="link('/tarefas')"
        label="Suas escalas"
      />
      <EmptyState
        title="Tarefa não encontrada"
        text="Ela pode ter sido trocada ou retirada da escala."
      />
    </template>
    <template v-else>
      <PageHead
        :eyebrow="dateLabel"
        :title="task.duty.name"
        :lede="`${task.service.title}${location ? ` · ${location}` : ''}`"
        :back="link('/tarefas')"
        back-label="Suas escalas"
      />

      <div class="card">
        <p
          v-if="task.duty.instructions"
          style="font-size:15.5px;line-height:1.55;color:var(--ink-2)"
        >
          {{ task.duty.instructions }}
        </p>
        <p
          v-if="task.arrivalAt"
          class="row strong"
          style="gap:8px;margin-top:10px"
        >
          <Icon
            name="clock"
            :weight="2"
            style="width:18px;height:18px"
          />Chegue às {{ time(task.arrivalAt, tz) }}
        </p>
        <p
          v-if="location"
          class="row soft"
          style="gap:8px;margin-top:6px"
        >
          <Icon
            name="pin"
            :weight="2"
            style="width:18px;height:18px"
          />{{ location }}
        </p>
      </div>

      <div
        v-if="isPast"
        class="panel strong"
        style="background:var(--surface-4);color:#4a5450;padding:12px 14px;border-radius:14px"
      >
        Esse culto já passou. Obrigado!
      </div>
      <template v-else>
        <div
          v-if="task.status === 'pending'"
          class="row"
          style="gap:10px"
        >
          <button
            type="button"
            class="btn"
            style="flex:1"
            :disabled="busy === task.assignmentId"
            @click="respond(task, 'confirmed')"
          >
            Confirmar
          </button>
          <button
            type="button"
            class="btn btn--secondary"
            style="min-height:50px;font-size:15px"
            @click="declining = task"
          >
            Não posso
          </button>
        </div>
        <div
          v-else-if="task.status === 'confirmed'"
          class="row strong"
          role="status"
          style="gap:10px;padding:12px 14px;border-radius:14px;background:#e3f3e8;color:#155f30;font-weight:700;flex-wrap:nowrap"
        >
          <Icon
            name="check"
            :weight="2.6"
            style="width:18px;height:18px"
          />
          <span class="grow">Você confirmou. Obrigado por servir!</span>
          <button
            type="button"
            class="link"
            style="color:inherit;font-size:13.5px"
            @click="declining = task"
          >
            Imprevisto?
          </button>
        </div>
        <div
          v-else
          class="row"
          role="status"
          style="gap:10px;padding:12px 14px;border-radius:14px;background:#fff1d6;color:#5c3a00;font-weight:700"
        >
          <span class="grow">Você avisou que não pode. A coordenação já sabe.</span>
          <button
            type="button"
            class="link"
            style="color:inherit;font-size:13.5px"
            :disabled="busy === task.assignmentId"
            @click="respond(task, 'confirmed')"
          >
            Posso sim
          </button>
        </div>

        <div
          v-if="openSwap"
          class="row"
          style="gap:10px;padding:12px 14px;border-radius:14px;background:#e3ebf8;color:#2f5fa8;font-weight:700"
        >
          <span class="grow">Você pediu a {{ openSwap.candidateName }} para assumir · aguardando resposta</span>
          <button
            type="button"
            class="link"
            style="color:inherit;font-size:13.5px"
            @click="cancelSwap(openSwap.id)"
          >
            Cancelar
          </button>
        </div>
        <button
          v-else-if="task.status !== 'declined'"
          type="button"
          class="card row"
          style="gap:12px;width:100%;text-align:left;color:inherit;flex-wrap:nowrap"
          @click="handoff = true"
        >
          <span
            class="ticon"
            style="width:44px;height:44px;border-radius:14px"
          ><Icon
            name="swap"
            :weight="2"
          /></span>
          <span style="flex:1">
            <span
              class="strong"
              style="display:block"
            >Pedir para alguém assumir</span>
            <span
              class="soft"
              style="display:block;font-size:13.5px"
            >Escolha quem faz {{ task.duty.name }}; a pessoa recebe o pedido.</span>
          </span>
          <Icon
            name="chevron-right"
            class="listrow__chev"
          />
        </button>
      </template>

      <div class="card">
        <h2 style="font-size:17px;margin-bottom:6px">
          Histórico
        </h2>
        <div
          v-for="(h, i) in history"
          :key="i"
          class="row"
          style="gap:10px;padding:8px 0;border-top:1px solid var(--line-2);flex-wrap:nowrap;align-items:flex-start"
        >
          <span
            style="width:8px;height:8px;border-radius:999px;margin-top:7px;flex:none"
            :style="{ background: h.dot }"
          />
          <span style="flex:1;font-size:14.5px">{{ h.text }}</span>
          <span
            class="muted"
            style="font-size:13px;white-space:nowrap"
          >{{ h.when }}</span>
        </div>
        <p
          v-if="!history.length"
          class="small muted"
          style="padding-top:4px"
        >
          Nenhuma resposta ainda.
        </p>
      </div>
    </template>

    <DeclineSheet
      :task="declining"
      :busy="Boolean(busy)"
      @close="declining = null"
      @decline="decline"
    />
    <Sheet
      v-model:open="handoff"
      title="Quem pode assumir?"
      :lede="task ? `Só quem faz ${task.duty.name} e está livre nesse culto. A pessoa recebe o pedido pelo WhatsApp e responde no app.` : ''"
    >
      <div
        v-if="available.length"
        role="radiogroup"
        aria-label="Quem pode assumir"
      >
        <button
          v-for="c in available"
          :key="c.personId"
          type="button"
          role="radio"
          class="listrow"
          style="padding:10px 4px;border-top:1px solid var(--line-2)"
          :aria-checked="chosen === c.personId"
          @click="chosen = c.personId"
        >
          <span
            class="av"
            style="width:40px;height:40px"
            aria-hidden="true"
          >{{ initials(c.displayName) }}</span>
          <span style="flex:1;min-width:0">
            <span
              class="strong"
              style="display:block"
            >{{ c.displayName }}</span>
            <span
              class="soft"
              style="display:block;font-size:13.5px"
            >{{ candSub(c) }}</span>
          </span>
          <span
            v-if="chosen === c.personId"
            style="width:26px;height:26px;border-radius:999px;background:var(--accent);color:var(--accent-ink);display:grid;place-items:center"
          ><Icon
            name="check"
            :weight="2.6"
            style="width:14px;height:14px"
          /></span>
        </button>
      </div>
      <p
        v-else
        class="muted"
      >
        Ninguém mais que faz essa função está livre. Use “Não posso” para avisar a coordenação.
      </p>
      <textarea
        v-model="note"
        class="textarea"
        style="min-height:80px;margin-top:12px;resize:vertical"
        maxlength="300"
        aria-label="Recado (opcional)"
        placeholder="Opcional. Ex.: vou estar no Sínodo nesse fim de semana"
      />
      <button
        type="button"
        class="btn btn--block"
        style="margin-top:14px"
        :disabled="!chosen || sending"
        @click="propose"
      >
        {{ chosen ? `Pedir a ${chosenName}` : 'Escolha alguém acima' }}
      </button>
    </Sheet>
  </section>
</template>
