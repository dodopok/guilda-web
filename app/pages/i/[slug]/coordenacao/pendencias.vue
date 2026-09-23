<script setup lang="ts">
useHead({ title: 'Pendências' })
const route = useRoute()
const { capi, tz, link } = useChurch()
interface Row { assignmentId: string, slotId: string, status: string, personName: string, dutyName: string, serviceId: string, serviceTitle: string, startsAt: string, statusChangedAt: string | null }
interface Pending {
  declined: Row[]
  overdue: Row[]
  pendingTotal: number
  openSwaps: { id: string, fromName: string, candidateName: string, dutyName: string, startsAt: string, createdAt: string }[]
  recentSwaps: { id: string, fromName: string, candidateName: string, dutyName: string, startsAt: string, respondedAt: string }[]
  messageProblems: number
}
const { data } = await useAsyncData(`pending-${route.params.slug}`, () => capi<Pending>('/pending'))
function editorLink(r: Row) {
  const month = localDateKey(r.startsAt, tz.value).slice(0, 7)
  return `${link(`/coordenacao/escalas/${month}`)}?vaga=${r.slotId}`
}
const nothing = computed(() => data.value && !data.value.declined.length && !data.value.overdue.length && !data.value.openSwaps.length && !data.value.messageProblems)
</script>

<template>
  <div class="page page--wide">
    <div class="page-head">
      <p class="kicker">
        Acompanhamento
      </p>
      <h1>Pendências</h1>
      <p
        v-if="data"
        class="lede"
      >
        {{ plural(data.pendingTotal, 'tarefa ainda sem confirmação', 'tarefas ainda sem confirmação') }} nas escalas publicadas.
      </p>
    </div>
    <EmptyState
      v-if="nothing"
      title="Nada pendente"
      text="Recusas, trocas em andamento e mensagens com problema aparecem aqui."
    />
    <template v-if="data">
      <section
        v-if="data.declined.length"
        class="section"
        style="margin-top:0"
      >
        <div class="section-head">
          <h2>Recusas sem substituto</h2><span class="badge-count">{{ data.declined.length }}</span>
        </div>
        <ul class="lines">
          <li
            v-for="r in data.declined"
            :key="r.assignmentId"
            class="line"
          >
            <span class="line__main">
              <span class="line__title">{{ r.dutyName }} · {{ longDate(r.startsAt, tz) }}</span>
              <span
                class="line__sub"
                style="display:block"
              >{{ r.personName }} avisou que não pode{{ r.statusChangedAt ? ` (${dateTime(r.statusChangedAt, tz)})` : '' }}</span>
            </span>
            <NuxtLink
              class="btn btn--small btn--primary"
              :to="editorLink(r)"
            >Escolher substituto</NuxtLink>
          </li>
        </ul>
      </section>
      <section
        v-if="data.overdue.length"
        class="section"
      >
        <div class="section-head">
          <h2>Sem resposta perto do culto</h2>
        </div>
        <ul class="lines">
          <li
            v-for="r in data.overdue"
            :key="r.assignmentId"
            class="line"
          >
            <span class="line__main">
              <span class="line__title">{{ r.personName }}</span>
              <span
                class="line__sub"
                style="display:block"
              >{{ r.dutyName }} · {{ longDate(r.startsAt, tz) }} às {{ time(r.startsAt, tz) }}</span>
            </span>
            <StatusMark status="pending" />
          </li>
        </ul>
      </section>
      <section
        v-if="data.openSwaps.length"
        class="section"
      >
        <div class="section-head">
          <h2>Trocas aguardando resposta</h2>
        </div>
        <ul class="lines">
          <li
            v-for="s in data.openSwaps"
            :key="s.id"
          >
            <span class="line__title">{{ s.fromName }} pediu a {{ s.candidateName }}</span>
            <span
              class="line__sub"
              style="display:block"
            >{{ s.dutyName }} · {{ longDate(s.startsAt, tz) }} · pedido em {{ dateTime(s.createdAt, tz) }}</span>
          </li>
        </ul>
      </section>
      <section
        v-if="data.recentSwaps.length"
        class="section"
      >
        <div class="section-head">
          <h2>Trocas concluídas (14 dias)</h2>
        </div>
        <ul class="lines lines--tight">
          <li
            v-for="s in data.recentSwaps"
            :key="s.id"
            class="small"
          >
            {{ dateTime(s.respondedAt, tz) }} — <strong>{{ s.candidateName }}</strong> assumiu {{ s.dutyName }} de {{ s.fromName }} ({{ shortDate(s.startsAt, tz) }})
          </li>
        </ul>
      </section>
      <section
        v-if="data.messageProblems"
        class="section"
      >
        <div class="section-head">
          <h2>Mensagens</h2>
        </div>
        <p style="margin-top:.75rem">
          {{ plural(data.messageProblems, 'mensagem não foi enviada ou falhou', 'mensagens não foram enviadas ou falharam') }} nos últimos 30 dias. <NuxtLink :to="link('/coordenacao/mensagens?status=blocked,failed,unknown')">Ver e reenviar</NuxtLink>
        </p>
      </section>
    </template>
  </div>
</template>
