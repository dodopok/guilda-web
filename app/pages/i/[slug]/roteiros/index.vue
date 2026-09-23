<script setup lang="ts">
useHead({ title: 'Roteiros' })
const route = useRoute()
const { capi, tz, link, isCoordinator } = useChurch()
interface ScriptRow { serviceId: string, title: string, startsAt: string, status: string, script: { status: string, version: number, hasUnpublishedChanges: boolean } | null }
const month = ref(currentMonth(tz.value))
const { data } = await useAsyncData(() => `scripts-${route.params.slug}-${month.value}`, () => capi<{ scripts: ScriptRow[] }>(`/scripts?month=${month.value}`), { watch: [month] })
</script>

<template>
  <div class="page">
    <div class="page-head">
      <p class="kicker">
        Liturgia
      </p>
      <div class="row row--between">
        <h1>Roteiros</h1>
        <MonthSwitch v-model="month" />
      </div>
    </div>
    <EmptyState
      v-if="!data?.scripts.length"
      title="Nenhum culto neste mês"
    />
    <ul
      v-else
      class="agenda"
    >
      <li
        v-for="s in data.scripts"
        :key="s.serviceId"
      >
        <DateBlock
          :at="s.startsAt"
          :tz="tz"
        />
        <div class="line">
          <span class="line__main">
            <NuxtLink
              v-if="s.script?.version"
              :to="link(`/roteiros/${s.serviceId}`)"
              class="line__title"
              style="font-size:1.1rem"
            >{{ s.title }}</NuxtLink>
            <span
              v-else
              class="line__title"
              style="font-size:1.1rem"
            >{{ s.title }}</span>
            <span
              class="line__sub"
              style="display:block"
            >
              {{ time(s.startsAt, tz) }} ·
              <template v-if="s.status === 'cancelled'">cancelado</template>
              <template v-else-if="s.script?.version">roteiro publicado{{ s.script.hasUnpublishedChanges && isCoordinator ? ' · há alterações não publicadas' : '' }}</template>
              <template v-else-if="s.script">em preparação</template>
              <template v-else>sem roteiro</template>
            </span>
          </span>
          <NuxtLink
            v-if="isCoordinator"
            class="btn btn--small"
            :to="link(`/coordenacao/roteiros/${s.serviceId}`)"
          >{{ s.script ? 'Editar' : 'Montar roteiro' }}</NuxtLink>
        </div>
      </li>
    </ul>
  </div>
</template>
