<script setup lang="ts">
import type { Task } from '~/types'

useHead({ title: 'Suas escalas' })
const route = useRoute()
const { capi, tz, link } = useChurch()
const { data } = await useAsyncData(`tasks-${route.params.slug}`, () => capi<{ tasks: Task[] }>('/me/tasks'))
const groups = computed(() => {
  const map = new Map<string, Task[]>()
  for (const t of data.value?.tasks ?? []) map.set(t.service.id, [...(map.get(t.service.id) ?? []), t])
  return [...map.values()]
})
const STATUS: Record<string, string> = { pending: 'A confirmar', confirmed: 'Confirmado', declined: 'Não pode' }
</script>

<template>
  <section class="stack-lg w-640">
    <BackLink
      :to="link('')"
      label="Início"
    />
    <h1 class="h1--sm">
      Suas escalas
    </h1>
    <div
      v-if="!groups.length"
      class="card--dashed"
    >
      <p
        class="strong"
        style="font-size:18px"
      >
        Nenhuma escala com seu nome por enquanto
      </p>
    </div>
    <div class="stack-sm">
      <NuxtLink
        v-for="g in groups"
        :key="g[0]!.service.id"
        :to="link(`/tarefas/${g[0]!.assignmentId}`)"
        class="card row"
        style="flex-wrap:nowrap;gap:14px;text-decoration:none;color:inherit"
      >
        <DateTile
          :date="g[0]!.service.startsAt"
          :tz="tz"
        />
        <span class="grow"><span
          class="strong"
          style="display:block"
        >{{ g.map((t) => t.duty.name).join(' · ') }}</span><span
          class="soft small"
          style="display:block"
        >{{ g[0]!.service.title }} · {{ time(g[0]!.service.startsAt, tz) }}</span></span>
        <span
          class="status"
          :class="`status--${g[0]!.status}`"
        >{{ STATUS[g[0]!.status] }}</span>
      </NuxtLink>
    </div>
  </section>
</template>
