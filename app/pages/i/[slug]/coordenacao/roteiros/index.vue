<script setup lang="ts">
useHead({ title: 'Roteiros' })
const route = useRoute()
const { capi, tz, link } = useChurch()
interface ScriptRow { serviceId: string, title: string, startsAt: string, status: string, script: { status: string, version: number, hasUnpublishedChanges: boolean } | null }
const month = ref(currentMonth(tz.value))
const { data } = await useAsyncData(() => `coord-scripts-${route.params.slug}-${month.value}`, () => capi<{ scripts: ScriptRow[] }>(`/scripts?month=${month.value}`), { watch: [month] })
function state(s: ScriptRow) {
  if (s.status === 'cancelled') return { text: 'culto cancelado', tone: 'plain' }
  if (!s.script) return { text: 'sem roteiro', tone: 'wait' }
  if (!s.script.version) return { text: 'rascunho', tone: 'info' }
  if (s.script.hasUnpublishedChanges) return { text: `publicado v${s.script.version} · com alterações`, tone: 'wait' }
  return { text: `publicado v${s.script.version}`, tone: 'ok' }
}
</script>

<template>
  <div class="page page--wide">
    <div class="page-head">
      <p class="kicker">
        Mês a mês
      </p>
      <div class="row row--between">
        <h1>Roteiros</h1>
        <MonthSwitch v-model="month" />
      </div>
      <p class="lede">
        Monte cada roteiro a partir de um modelo e da escala. Os nomes vêm da escala; os dados do dia, do Estêvão.
      </p>
    </div>
    <EmptyState
      v-if="!data?.scripts.length"
      title="Nenhum culto neste mês"
    >
      <NuxtLink
        class="btn"
        :to="link(`/coordenacao/cultos/${month}`)"
      >Cadastrar cultos</NuxtLink>
    </EmptyState>
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
            <span
              class="line__title"
              style="font-size:1.1rem"
            >{{ s.title }}</span>
            <span
              class="line__sub"
              style="display:block"
            >{{ time(s.startsAt, tz) }} · <span
              class="tag"
              :class="`tag--${state(s).tone}`"
            >{{ state(s).text }}</span></span>
          </span>
          <NuxtLink
            v-if="s.status !== 'cancelled'"
            class="btn btn--small"
            :class="{ 'btn--primary': !s.script }"
            :to="link(`/coordenacao/roteiros/${s.serviceId}`)"
          >{{ s.script ? 'Editar' : 'Montar roteiro' }}</NuxtLink>
        </div>
      </li>
    </ul>
  </div>
</template>
