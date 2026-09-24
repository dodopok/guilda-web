<script setup lang="ts">
import type { Task } from '~/types'

useHead({ title: 'Suas escalas' })
const route = useRoute()
const { capi, tz, link } = useChurch()
const { data, refresh } = await useAsyncData(`my-tasks-${route.params.slug}`, () => capi<{ tasks: Task[] }>('/me/tasks?past=1'))
const { respond, busy } = useRespond(refresh)
const now = Date.now()
const showPast = ref(false)
const upcoming = computed(() => (data.value?.tasks ?? []).filter((t) => new Date(t.service.startsAt).getTime() >= now))
const past = computed(() => (data.value?.tasks ?? []).filter((t) => new Date(t.service.startsAt).getTime() < now).reverse())
function byMonth(items: Task[], isPast = false) {
  const groups = new Map<string, Task[]>()
  for (const task of items) {
    const month = localDateKey(task.service.startsAt, tz.value).slice(0, 7)
    groups.set(month, [...(groups.get(month) ?? []), task])
  }
  return [...groups.entries()].map(([month, tasks]) => ({ month, label: monthName(month), items: tasks, past: isPast }))
}
const upcomingGroups = computed(() => byMonth(upcoming.value))
const pastGroups = computed(() => byMonth(past.value, true))
const tag = (t: Task, isPast: boolean) => TASK_TAG[isPast ? 'past' : t.status]!
function sub(t: Task) {
  const d = `${weekdayLong(t.service.startsAt, tz.value)}, ${time(t.service.startsAt, tz.value)}`
  return t.arrivalAt ? `${d} · chegue às ${time(t.arrivalAt, tz.value)}` : d
}
</script>

<template>
  <section class="stack-lg w-640">
    <PageHead
      title="Suas escalas"
      :lede="upcoming.length ? `Você tem ${plural(upcoming.length, 'tarefa marcada', 'tarefas marcadas')}. Toque para ver os detalhes.` : 'Nada marcado por enquanto.'"
      :back="link('/perfil')"
      back-label="Você"
    />
    <div
      v-for="g in upcomingGroups"
      :key="g.label"
    >
      <p
        class="caps"
        style="margin-bottom:8px"
      >
        {{ g.label }}
      </p>
      <div class="card card--flush rows">
        <div
          v-for="t in g.items"
          :key="t.assignmentId"
          class="task-listrow"
        >
          <NuxtLink
            :to="link(`/tarefas/${t.assignmentId}`)"
            class="task-listrow__link"
          >
            <span
              style="width:44px;text-align:center;flex:none"
              aria-hidden="true"
            >
              <span
                class="muted"
                style="display:block;font-size:11px;font-weight:800;text-transform:uppercase"
              >{{ weekdayShort(t.service.startsAt, tz) }}</span>
              <span style="display:block;font-size:20px;font-weight:800;line-height:1">{{ dayNumber(t.service.startsAt, tz) }}</span>
            </span>
            <span style="flex:1;min-width:0">
              <span
                class="strong"
                style="display:block"
              >{{ t.duty.name }}<span class="sr-only">, {{ longDate(t.service.startsAt, tz) }}</span></span>
              <span
                class="soft"
                style="display:block;font-size:13.5px"
              >{{ sub(t) }}</span>
            </span>
            <span
              class="stag"
              :style="{ background: tag(t, g.past).bg, color: tag(t, g.past).fg }"
            >{{ tag(t, g.past).label }}</span>
            <Icon
              name="chevron-right"
              class="listrow__chev"
            />
          </NuxtLink>
          <button
            v-if="!g.past && t.status === 'pending'"
            type="button"
            class="btn btn--secondary btn--xs task-listrow__confirm"
            :disabled="busy === t.assignmentId"
            :aria-label="`Confirmar ${t.duty.name}, ${longDate(t.service.startsAt, tz)}`"
            @click="respond(t, 'confirmed')"
          >
            {{ busy === t.assignmentId ? 'Salvando…' : 'Confirmar' }}
          </button>
        </div>
      </div>
    </div>
    <button
      v-if="past.length"
      type="button"
      class="link link--muted"
      style="align-self:flex-start;font-size:14px"
      :aria-expanded="showPast"
      @click="showPast = !showPast"
    >
      {{ showPast ? 'Ocultar as que já passaram' : `Ver as que já passaram (${past.length})` }}
    </button>
    <div
      v-if="showPast"
      class="stack-lg"
    >
      <div
        v-for="g in pastGroups"
        :key="g.label"
      >
        <p
          class="caps"
          style="margin-bottom:8px"
        >
          {{ g.label }}
        </p>
        <div class="card card--flush rows">
          <div
            v-for="t in g.items"
            :key="t.assignmentId"
            class="task-listrow"
          >
            <NuxtLink
              :to="link(`/tarefas/${t.assignmentId}`)"
              class="task-listrow__link"
            >
              <span
                style="width:44px;text-align:center;flex:none"
                aria-hidden="true"
              >
                <span
                  class="muted"
                  style="display:block;font-size:11px;font-weight:800;text-transform:uppercase"
                >{{ weekdayShort(t.service.startsAt, tz) }}</span>
                <span style="display:block;font-size:20px;font-weight:800;line-height:1">{{ dayNumber(t.service.startsAt, tz) }}</span>
              </span>
              <span style="flex:1;min-width:0">
                <span
                  class="strong"
                  style="display:block"
                >{{ t.duty.name }}<span class="sr-only">, {{ longDate(t.service.startsAt, tz) }}</span></span>
                <span
                  class="soft"
                  style="display:block;font-size:13.5px"
                >{{ sub(t) }}</span>
              </span>
              <span
                class="stag"
                :style="{ background: tag(t, true).bg, color: tag(t, true).fg }"
              >{{ tag(t, true).label }}</span>
              <Icon
                name="chevron-right"
                class="listrow__chev"
              />
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>
    <div
      v-if="!upcomingGroups.length && !past.length"
      class="card--dashed soft"
      style="padding:24px 20px"
    >
      Nenhuma escala com seu nome ainda.
    </div>
  </section>
</template>
