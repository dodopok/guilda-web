<script setup lang="ts">
import type { Task } from '~/types'

interface Candidate {
  personId: string
  displayName: string
  available: boolean
  problems: string[]
  monthTasks: number
  month: string
}

const props = defineProps<{ task: Task | null, busy?: boolean }>()
const emit = defineEmits<{ (e: 'close'): void, (e: 'decline', candidate?: Candidate): void }>()
const { capi, tz } = useChurch()
const candidates = ref<Candidate[]>([])
const chosen = ref<string | null>(null)
const loading = ref(false)
const showAll = ref(false)
const open = computed({ get: () => Boolean(props.task), set: (v) => { if (!v) emit('close') } })

watch(() => props.task?.assignmentId, async (assignmentId) => {
  candidates.value = []
  chosen.value = null
  showAll.value = false
  if (!assignmentId) return
  loading.value = true
  try {
    const result = await capi<{ candidates: Candidate[] }>(`/assignments/${assignmentId}/candidates`)
    candidates.value = result.candidates.filter((candidate) => candidate.available)
      .sort((a, b) => a.monthTasks - b.monthTasks || a.displayName.localeCompare(b.displayName, 'pt-BR'))
    chosen.value = candidates.value[0]?.personId ?? null
  } catch {
    candidates.value = []
  } finally {
    loading.value = false
  }
}, { immediate: true })

const selected = computed(() => candidates.value.find((candidate) => candidate.personId === chosen.value) ?? null)
const visibleCandidates = computed(() => (showAll.value ? candidates.value : candidates.value.slice(0, 2)))
const heading = computed(() => {
  const task = props.task
  if (!task) return 'Avisar que não pode'
  return `Não pode em ${task.duty.name}, ${weekdayShort(task.service.startsAt, tz.value)} ${dayNumber(task.service.startsAt, tz.value)}?`
})
function candidateSub(candidate: Candidate) {
  const month = monthName(candidate.month).toLowerCase()
  return candidate.monthTasks ? plural(candidate.monthTasks, `tarefa em ${month}`, `tarefas em ${month}`) : `Ainda sem tarefa em ${month}`
}
function submit(candidate?: Candidate) {
  emit('decline', candidate)
}
</script>

<template>
  <Sheet
    v-model:open="open"
    size="compact"
    :title="heading"
    lede="Tudo bem. A coordenação é avisada agora. Se quiser, já indique quem pode assumir — a pessoa recebe o pedido."
  >
    <template v-if="task">
      <p class="caps">
        Quem faz {{ task.duty.name }} e está livre
      </p>
      <p
        v-if="loading"
        class="small muted"
        role="status"
        style="padding:12px 0"
      >
        Procurando quem pode assumir…
      </p>
      <div
        v-else-if="candidates.length"
        class="stack-sm"
        role="radiogroup"
        aria-label="Escolha quem pode assumir"
        style="gap:8px;margin-top:8px"
      >
        <button
          v-for="candidate in visibleCandidates"
          :key="candidate.personId"
          type="button"
          role="radio"
          class="decline-candidate"
          :class="{ 'decline-candidate--selected': chosen === candidate.personId }"
          :aria-checked="chosen === candidate.personId"
          @click="chosen = candidate.personId"
        >
          <span class="av av--lg">{{ initials(candidate.displayName) }}</span>
          <span class="grow">
            <span class="decline-candidate__name">{{ candidate.displayName }}</span>
            <span class="decline-candidate__sub">{{ candidateSub(candidate) }}</span>
          </span>
          <span
            v-if="chosen === candidate.personId"
            class="decline-candidate__check"
            aria-hidden="true"
          ><Icon
            name="check"
            :weight="2.6"
            style="width:15px;height:15px"
          /></span>
        </button>
      </div>
      <p
        v-else-if="!loading"
        class="small muted"
        style="margin-top:8px"
      >
        Ninguém que faz essa função está livre agora. Você ainda pode avisar a coordenação.
      </p>
      <button
        v-if="!loading && candidates.length > 2"
        type="button"
        class="link link--muted"
        style="margin-top:4px"
        @click="showAll = !showAll"
      >
        {{ showAll ? 'Mostrar menos' : `Ver todas (${candidates.length})` }}
      </button>
      <div
        class="stack-sm"
        style="margin-top:16px"
      >
        <button
          v-if="selected"
          type="button"
          class="btn btn--block"
          :disabled="busy"
          @click="submit(selected)"
        >
          {{ busy ? 'Avisando…' : `Avisar e pedir para ${selected.displayName.split(' ')[0]} assumir` }}
        </button>
        <button
          type="button"
          class="btn btn--secondary btn--block"
          :disabled="busy"
          @click="submit()"
        >
          Só avisar, sem indicar
        </button>
      </div>
    </template>
  </Sheet>
</template>
