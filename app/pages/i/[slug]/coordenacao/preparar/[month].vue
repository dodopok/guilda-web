<script setup lang="ts">
import type { ScheduleEditor } from '~/types'

// Preparar o mês em quatro passos: cultos, perguntar quem não pode, montar e publicar.
const route = useRoute()
const month = computed(() => String(route.params.month))
const { capi, link } = useChurch()
useHead(() => ({ title: `Preparar ${monthName(month.value)}` }))

const { data: editor, refresh: refreshEditor } = await useAsyncData(() => `prep-editor-${route.params.slug}-${month.value}`, () => capi<ScheduleEditor>(`/schedule/${month.value}`), { watch: [month] })
const { data: avail, refresh: refreshAvail } = await useAsyncData(() => `prep-avail-${route.params.slug}-${month.value}`, () => capi<{ request: { status: string } | null }>(`/availability/${month.value}`), { watch: [month] })

const published = computed(() => editor.value?.status === 'published')
// Passo inicial: o que ainda falta fazer (a Mesa manda o passo pela URL).
const defaultStep = computed(() => {
  if (published.value) return 4
  if (!editor.value?.services.length) return 1
  const req = avail.value?.request
  if (!req || req.status === 'cancelled') return 2
  return 3
})
const step = computed(() => {
  const n = Number(route.query.passo)
  return n >= 1 && n <= 4 ? n : defaultStep.value
})
function go(n: number, extra: Record<string, string> = {}) {
  return navigateTo({ path: route.path, query: { passo: String(n), ...extra } })
}
const steps = computed(() => [['Cultos', 1], ['Perguntar', 2], ['Montar', 3], ['Publicar', 4]].map(([label, n]) => ({
  label: label as string,
  n: n as number,
  cur: n === step.value,
  done: (n as number) < step.value || (n === 4 && published.value),
})))
async function goAfterRefresh(n: number) {
  await refreshAll()
  await go(n)
}
async function refreshAll() {
  await Promise.all([refreshEditor(), refreshAvail()])
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
</script>

<template>
  <section class="stack-lg">
    <div
      class="row prep-page-header"
      :class="{ 'prep-page-header--build': step === 3 }"
      style="gap:12px"
    >
      <BackLink
        :to="link('/coordenacao')"
        label="Mesa"
      />
      <h1
        class="h1--xs"
        style="flex:1 1 200px"
      >
        Preparar {{ monthName(month) }}
      </h1>
      <NuxtLink
        v-if="step === 3"
        :to="{ path: route.path, query: { passo: '4' } }"
        class="btn btn--sm prep-publish-corner"
      >
        Publicar
      </NuxtLink>
      <nav
        class="row"
        style="gap:4px"
        aria-label="Mês"
      >
        <NuxtLink
          :to="link(`/coordenacao/preparar/${shiftMonth(month, -1)}`)"
          class="icon-btn"
          :aria-label="`Preparar ${monthName(shiftMonth(month, -1))}`"
        ><Icon name="chevron-left" /></NuxtLink>
        <NuxtLink
          :to="link(`/coordenacao/preparar/${shiftMonth(month, 1)}`)"
          class="icon-btn"
          :aria-label="`Preparar ${monthName(shiftMonth(month, 1))}`"
        ><Icon name="chevron-right" /></NuxtLink>
      </nav>
    </div>
    <ol
      class="stepper"
      :class="{ 'stepper--build': step === 3 }"
      aria-label="Passos"
    >
      <li
        v-for="s in steps"
        :key="s.n"
      >
        <NuxtLink
          :to="{ path: route.path, query: { passo: String(s.n) } }"
          :class="{ 'is-done': s.done && !s.cur }"
          :aria-current="s.cur ? 'step' : undefined"
        >
          <span><Icon
            v-if="s.done && !s.cur"
            name="check"
            :weight="2.6"
          /><template v-else>{{ s.n }}</template></span>{{ s.label }}
        </NuxtLink>
      </li>
    </ol>

    <div
      v-if="step === 1"
      class="prep-step-one-grid"
    >
      <PrepStepServices
        :month="month"
        @next="goAfterRefresh(2)"
        @changed="refreshAll"
      />
      <div class="prep-step-one-ask">
        <PrepStepAsk
          :month="month"
          @next="go(3)"
          @changed="refreshAvail"
        />
      </div>
    </div>
    <PrepStepAsk
      v-else-if="step === 2"
      :month="month"
      @next="go(3)"
      @changed="refreshAvail"
    />
    <PrepStepBuild
      v-else-if="step === 3 && editor"
      :editor="editor"
      :month="month"
      :focus="typeof route.query.culto === 'string' ? route.query.culto : null"
      @refresh="refreshEditor"
      @next="go(4)"
    />
    <PrepStepPublish
      v-else-if="step === 4 && editor"
      :editor="editor"
      :month="month"
      @refresh="refreshEditor"
      @fix="(serviceId: string) => go(3, { culto: serviceId })"
      @back="go(3)"
    />
    <p
      v-if="editor && !editor.services.length && step > 2"
      class="card--dashed"
    >
      Ainda não há cultos em {{ monthName(month) }}. <NuxtLink :to="{ path: route.path, query: { passo: '1' } }">
        {{ cap('marcar os cultos') }}
      </NuxtLink>
    </p>
  </section>
</template>
