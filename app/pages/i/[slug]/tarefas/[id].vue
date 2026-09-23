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
  <section class="stack-lg w-640">
    <BackLink
      :to="link('')"
      label="Início"
    />
    <div
      v-if="!task"
      class="card--dashed"
    >
      <p
        class="strong"
        style="font-size:18px"
      >
        Tarefa não encontrada
      </p>
      <p
        class="soft"
        style="margin:6px auto 0;max-width:380px"
      >
        Ela pode ter passado, sido trocada ou retirada da escala.
      </p>
      <NuxtLink
        :to="link('/tarefas')"
        class="btn btn--secondary btn--md"
        style="margin-top:16px"
      >
        Ver suas escalas
      </NuxtLink>
    </div>
    <template v-else>
      <article class="card card--lg card--flush">
        <div
          class="row"
          style="flex-wrap:nowrap;gap:16px;padding:20px;border-bottom:1px solid var(--line-2)"
        >
          <DateTile
            :date="task.service.startsAt"
            :tz="tz"
            accent
            large
            month
          />
          <div class="grow">
            <h1 style="font-size:22px">
              {{ task.duty.name }}
            </h1>
            <p
              class="soft"
              style="margin-top:3px;font-size:15px"
            >
              {{ task.service.title }} · {{ longDate(task.service.startsAt, tz) }}, {{ time(task.service.startsAt, tz) }}<template v-if="task.service.location">
                · {{ task.service.location }}
              </template>
            </p>
          </div>
        </div>
        <div style="padding:18px 20px">
          <span
            class="status"
            :class="`status--${task.status}`"
          >{{ task.status === 'confirmed' ? 'Confirmado' : task.status === 'declined' ? 'Você avisou que não pode' : 'Aguardando sua confirmação' }}</span>
          <p
            v-if="task.arrivalAt"
            style="margin-top:10px"
          >
            Chegue às <strong>{{ time(task.arrivalAt, tz) }}</strong>
          </p>
          <p
            v-if="task.duty.instructions"
            style="margin-top:8px;color:var(--ink-2)"
          >
            {{ task.duty.instructions }}
          </p>
          <p
            v-if="task.status === 'pending'"
            class="small soft"
            style="margin-top:8px"
          >
            Responda até {{ dateTime(task.respondBy, tz) }}.
          </p>
          <div
            v-if="task.status !== 'confirmed'"
            style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px"
          >
            <button
              type="button"
              class="btn btn--ok"
              style="min-height:48px"
              :disabled="busy === task.assignmentId"
              @click="respond(task, 'confirmed')"
            >
              <Icon
                name="check"
                :weight="2.2"
              />{{ task.status === 'declined' ? 'Posso sim' : 'Confirmar' }}
            </button>
            <button
              v-if="task.status === 'pending'"
              type="button"
              class="btn btn--secondary"
              style="min-height:48px"
              @click="declining = task"
            >
              Não posso
            </button>
          </div>
          <button
            v-else
            type="button"
            class="link"
            style="margin-top:10px"
            @click="declining = task"
          >
            Imprevisto? Avisar
          </button>
        </div>
      </article>

      <section
        id="troca"
        class="stack-sm"
      >
        <div>
          <h2 class="h3">
            Pedir para alguém assumir
          </h2>
          <p
            class="soft small"
            style="margin-top:2px"
          >
            Só aparecem pessoas habilitadas para {{ task.duty.name }}. A troca vale quando a pessoa aceitar.
          </p>
        </div>
        <div
          v-for="s in task.openSwaps"
          :key="s.id"
          class="panel panel--soft row"
        >
          <p class="grow">
            Pedido enviado para <strong>{{ s.candidateName }}</strong>.
          </p>
          <button
            type="button"
            class="link"
            @click="cancelSwap(s.id)"
          >
            Cancelar pedido
          </button>
        </div>
        <div
          v-if="available.length"
          class="card card--flush list"
          role="radiogroup"
          aria-label="Quem pode assumir"
        >
          <button
            v-for="c in available"
            :key="c.personId"
            type="button"
            class="listrow"
            role="radio"
            :aria-checked="chosen === c.personId"
            :style="chosen === c.personId ? 'background:var(--accent-soft)' : ''"
            @click="chosen = c.personId"
          >
            <span class="av">{{ initials(c.displayName) }}</span>
            <span class="grow strong">{{ c.displayName }}</span>
            <Icon
              v-if="chosen === c.personId"
              name="check"
              :weight="2.4"
              style="width:18px;height:18px;color:var(--accent-deep)"
            />
          </button>
        </div>
        <p
          v-else
          class="note"
        >
          Ninguém habilitado está livre neste culto. Avise a coordenação pelo botão “Não posso”.
        </p>
        <details
          v-if="unavailable.length"
          class="small soft"
        >
          <summary style="cursor:pointer;font-weight:700">
            Habilitados que não podem ({{ unavailable.length }})
          </summary>
          <p
            v-for="c in unavailable"
            :key="c.personId"
            style="margin-top:6px"
          >
            {{ c.displayName }} — {{ c.problems.join(', ') }}
          </p>
        </details>
        <template v-if="chosen">
          <label class="field">
            <span class="field__label">Recado <span class="field__opt">(opcional)</span></span>
            <input
              v-model="message"
              class="input"
              maxlength="300"
              placeholder="Ex.: vou viajar nesse fim de semana"
            >
          </label>
          <button
            type="button"
            class="btn"
            :disabled="sending"
            @click="propose"
          >
            Enviar pedido
          </button>
        </template>
      </section>

      <section
        v-if="data?.history.length"
        class="stack-sm"
      >
        <p class="section-label">
          Histórico
        </p>
        <div class="card card--flush list">
          <p
            v-for="(h, i) in data.history"
            :key="i"
            class="small"
            style="padding:10px 16px"
          >
            {{ dateTime(h.createdAt, tz) }} · {{ h.personName }} {{ h.decision === 'confirmed' ? 'confirmou' : 'avisou que não pode' }} {{ CHANNEL[h.channel] ?? '' }}<template v-if="h.note">
              — “{{ h.note }}”
            </template>
          </p>
        </div>
      </section>
    </template>
    <DeclineSheet
      :task="declining"
      :busy="Boolean(busy)"
      @close="declining = null"
      @decline="decline"
    />
  </section>
</template>
