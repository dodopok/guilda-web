<script setup lang="ts">
import type { Task } from '~/types'

useHead({ title: 'Suas escalas' })
const route = useRoute()
const { capi, tz, link } = useChurch()
const { data } = await useAsyncData(`my-tasks-${route.params.slug}`, () => capi<{ tasks: Task[] }>('/me/tasks?past=1'))
const now = Date.now()
const upcoming = computed(() => (data.value?.tasks ?? []).filter((t) => new Date(t.service.startsAt).getTime() >= now))
const past = computed(() => (data.value?.tasks ?? []).filter((t) => new Date(t.service.startsAt).getTime() < now).reverse())
const groups = computed(() => [{ label: 'Próximas', items: upcoming.value, past: false }, { label: 'Já passaram', items: past.value, past: true }].filter((g) => g.items.length))
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
      v-for="g in groups"
      :key="g.label"
    >
      <p
        class="caps"
        style="margin-bottom:8px"
      >
        {{ g.label }}
      </p>
      <div class="card card--flush rows">
        <NuxtLink
          v-for="t in g.items"
          :key="t.assignmentId"
          :to="link(`/tarefas/${t.assignmentId}`)"
          class="listrow"
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
      </div>
    </div>
    <div
      v-if="!groups.length"
      class="card--dashed soft"
      style="padding:24px 20px"
    >
      Nenhuma escala com seu nome ainda.
    </div>
  </section>
</template>
