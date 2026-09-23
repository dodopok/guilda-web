<script setup lang="ts">
import type { Task } from '~/types'

useHead({ title: 'Minhas escalas' })
const route = useRoute()
const { capi, tz } = useChurch()
const { data, refresh } = await useAsyncData(`tasks-${route.params.slug}`, () => capi<{ tasks: Task[] }>('/me/tasks'))
const { respond, busy } = useRespond(refresh)
const declining = ref<Task | null>(null)
async function decline(note: string) {
  if (!declining.value) return
  await respond(declining.value, 'declined', note)
  declining.value = null
}
const days = computed(() => {
  const byDay = new Map<string, Task[]>()
  for (const t of data.value?.tasks ?? []) {
    const k = localDateKey(t.service.startsAt, tz.value)
    byDay.set(k, [...(byDay.get(k) ?? []), t])
  }
  return [...byDay.values()]
})
const pending = computed(() => (data.value?.tasks ?? []).filter((t) => t.status === 'pending').length)
</script>

<template>
  <div class="page">
    <div class="page-head">
      <p class="kicker">
        Suas escalas
      </p>
      <h1>Minhas escalas</h1>
      <p
        v-if="pending"
        class="lede"
      >
        {{ pending === 1 ? 'Uma tarefa espera sua confirmação.' : `${pending} tarefas esperam sua confirmação.` }}
      </p>
      <p
        v-else-if="days.length"
        class="lede"
      >
        Tudo respondido. Obrigado por servir!
      </p>
    </div>
    <EmptyState
      v-if="!days.length"
      title="Nenhuma escala por enquanto"
      text="Quando a coordenação publicar uma escala com seu nome, ela aparece aqui."
    />
    <ul
      v-else
      class="agenda"
    >
      <li
        v-for="day in days"
        :key="day[0]!.assignmentId"
      >
        <DateBlock
          :at="day[0]!.service.startsAt"
          :tz="tz"
        />
        <div>
          <p class="sr-only">
            {{ longDate(day[0]!.service.startsAt, tz) }}
          </p>
          <TaskItem
            v-for="t in day"
            :key="t.assignmentId"
            :task="t"
            :busy="busy === t.assignmentId"
            @confirm="respond(t, 'confirmed')"
            @decline="declining = t"
          />
        </div>
      </li>
    </ul>
    <DeclineSheet
      :task="declining"
      :busy="Boolean(busy)"
      @close="declining = null"
      @decline="decline"
    />
  </div>
</template>
