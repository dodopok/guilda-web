<script setup lang="ts">
import type { Task } from '~/types'

useHead({ title: 'Tarefa' })
const route = useRoute()
const id = String(route.params.id)
const { capi, tz, link } = useChurch()
const toast = useToast()
const { data, refresh } = await useAsyncData(`task-${id}`, async () => {
  const [tasks, candidates, history] = await Promise.all([
    capi<{ tasks: Task[] }>('/me/tasks'),
    capi<{ candidates: { personId: string, displayName: string, available: boolean, problems: string[] }[] }>(`/assignments/${id}/candidates`).catch(() => ({ candidates: [] })),
    capi<{ responses: { decision: string, channel: string, note: string | null, createdAt: string, personName: string }[] }>(`/assignments/${id}/history`).catch(() => ({ responses: [] })),
  ])
  return { task: tasks.tasks.find((t) => t.assignmentId === id) ?? null, candidates: candidates.candidates, history: history.responses }
})
const { respond, busy } = useRespond(refresh)
const task = computed(() => data.value?.task ?? null)
const declining = ref<Task | null>(null)
async function decline(note: string) {
  if (!declining.value) return
  await respond(declining.value, 'declined', note)
  declining.value = null
}

const chosen = ref<string | null>(null)
const message = ref('')
const sending = ref(false)
const available = computed(() => (data.value?.candidates ?? []).filter((c) => c.available))
const unavailable = computed(() => (data.value?.candidates ?? []).filter((c) => !c.available))
async function propose() {
  if (!chosen.value) return
  sending.value = true
  try {
    await capi(`/assignments/${id}/swaps`, { method: 'POST', body: { candidatePersonId: chosen.value, message: message.value || null } })
    const name = data.value?.candidates.find((c) => c.personId === chosen.value)?.displayName
    toast.ok(`Pedido enviado para ${name}. A troca vale quando a pessoa aceitar.`)
    chosen.value = null
    message.value = ''
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
    toast.ok('Pedido de troca cancelado.')
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}
const CHANNEL: Record<string, string> = { app: 'pelo app', coordination: 'registrado pela coordenação', whatsapp: 'pelo WhatsApp' }
</script>

<template>
  <div class="page">
    <p
      class="no-print"
      style="margin-bottom:1rem"
    >
      <NuxtLink :to="link('/tarefas')"><Icon
        name="arrow-left"
        style="width:1rem;height:1rem;vertical-align:-.15em"
      /> Minhas escalas</NuxtLink>
    </p>
    <EmptyState
      v-if="!task"
      title="Tarefa não encontrada"
      text="Ela pode ter passado, sido trocada ou retirada da escala."
    >
      <NuxtLink
        class="btn"
        :to="link('/tarefas')"
      >Ver minhas escalas</NuxtLink>
    </EmptyState>
    <template v-else>
      <div class="page-head">
        <p class="kicker">
          {{ task.duty.ministry }}
        </p>
        <h1>{{ task.duty.name }}</h1>
        <p class="lede">
          {{ longDate(task.service.startsAt, tz) }} · {{ task.service.title }} às {{ time(task.service.startsAt, tz) }}
        </p>
      </div>
      <dl class="dl">
        <dt>Chegada</dt>
        <dd>{{ task.arrivalAt ? time(task.arrivalAt, tz) : 'a combinar com a coordenação' }}</dd>
        <template v-if="task.service.location">
          <dt>Local</dt><dd>{{ task.service.location }}</dd>
        </template>
        <dt>Situação</dt>
        <dd><StatusMark :status="task.status" /></dd>
        <dt>Responder até</dt>
        <dd>{{ dateTime(task.respondBy, tz) }}</dd>
      </dl>

      <section class="section">
        <div class="section-head">
          <h2>O que fazer</h2>
        </div>
        <p style="margin-top:.75rem;white-space:pre-line">
          {{ task.duty.instructions || 'A coordenação ainda não escreveu instruções para esta função.' }}
        </p>
        <p
          v-if="task.note"
          style="margin-top:.75rem"
        >
          <strong>Observação deste culto:</strong> {{ task.note }}
        </p>
      </section>

      <div
        class="row"
        style="margin-top:1.75rem"
      >
        <template v-if="task.status !== 'confirmed'">
          <button
            type="button"
            class="btn btn--ok"
            :disabled="busy === task.assignmentId"
            @click="respond(task, 'confirmed')"
          >
            <Icon name="check" /> Confirmar
          </button>
        </template>
        <button
          v-if="task.status !== 'declined'"
          type="button"
          class="btn btn--no"
          :disabled="busy === task.assignmentId"
          @click="declining = task"
        >
          Não posso
        </button>
      </div>

      <section
        id="troca"
        class="section"
      >
        <div class="section-head">
          <h2>Pedir para alguém assumir</h2>
        </div>
        <p
          class="ink-2"
          style="margin-top:.75rem"
        >
          Só aparecem pessoas habilitadas para {{ task.duty.name }}. Nada muda na escala até a pessoa aceitar; aí a troca vale na hora, sem aprovação da coordenação.
        </p>
        <ul
          v-if="task.openSwaps.length"
          class="lines"
          style="margin-top:1rem"
        >
          <li
            v-for="s in task.openSwaps"
            :key="s.id"
            class="line"
          >
            <span class="line__main"><strong>{{ s.candidateName }}</strong> <span class="muted">ainda não respondeu</span></span>
            <button
              type="button"
              class="btn btn--quiet btn--small"
              @click="cancelSwap(s.id)"
            >
              Cancelar pedido
            </button>
          </li>
        </ul>
        <fieldset style="margin-top:1rem">
          <legend class="sr-only">
            Escolha quem pode assumir
          </legend>
          <div
            v-if="available.length"
            class="choice-list"
          >
            <label
              v-for="c in available"
              :key="c.personId"
              class="check"
            >
              <input
                v-model="chosen"
                type="radio"
                name="candidate"
                :value="c.personId"
              >
              <span class="check__text"><strong>{{ c.displayName }}</strong></span>
            </label>
          </div>
          <p
            v-else
            class="muted"
          >
            Ninguém habilitado está livre neste horário. Fale com a coordenação.
          </p>
          <details
            v-if="unavailable.length"
            style="margin-top:.75rem"
          >
            <summary class="small">
              Habilitados que não podem ({{ unavailable.length }})
            </summary>
            <ul
              class="lines lines--tight small"
              style="margin-top:.5rem"
            >
              <li
                v-for="c in unavailable"
                :key="c.personId"
              >
                {{ c.displayName }} — <span class="muted">{{ c.problems.join('; ') }}</span>
              </li>
            </ul>
          </details>
        </fieldset>
        <div
          v-if="chosen"
          class="field"
          style="margin-top:1rem"
        >
          <label
            class="field__label"
            for="swap-msg"
          >Recado (opcional)</label>
          <input
            id="swap-msg"
            v-model="message"
            class="input"
            maxlength="300"
            placeholder="Ex.: Tenho uma viagem de família"
          >
        </div>
        <button
          type="button"
          class="btn btn--primary"
          style="margin-top:1rem"
          :disabled="!chosen || sending"
          @click="propose"
        >
          <Icon name="send" /> Enviar pedido
        </button>
      </section>

      <section
        v-if="data?.history.length"
        class="section"
      >
        <div class="section-head">
          <h2>Histórico</h2>
        </div>
        <ul
          class="lines lines--tight"
          style="margin-top:.5rem"
        >
          <li
            v-for="(h, i) in data.history"
            :key="i"
            class="small"
          >
            {{ dateTime(h.createdAt, tz) }} — {{ h.personName }} {{ h.decision === 'confirmed' ? 'confirmou' : 'avisou que não pode' }} ({{ CHANNEL[h.channel] ?? h.channel }})<template v-if="h.note">
              : “{{ h.note }}”
            </template>
          </li>
        </ul>
      </section>
    </template>
    <DeclineSheet
      :task="declining"
      :busy="Boolean(busy)"
      @close="declining = null"
      @decline="decline"
    />
  </div>
</template>
