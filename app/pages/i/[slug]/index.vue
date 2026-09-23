<script setup lang="ts">
import type { HomeResponse, Task } from '~/types'

useHead({ title: 'Início' })
const route = useRoute()
const { capi, link, tz, info, isCoordinator } = useChurch()
const { me } = useSession()
const { data, refresh, error } = await useAsyncData(`home-${route.params.slug}`, () => capi<HomeResponse>('/me/home'))
const { respond, busy } = useRespond(refresh)

const declining = ref<Task | null>(null)
async function decline(note: string) {
  const t = declining.value
  if (!t) return
  await respond(t, 'declined', note)
  declining.value = null
}

const next = computed(() => data.value?.tasks[0] ?? null)
const nextGroup = computed(() => {
  // Tarefas no mesmo culto da próxima aparecem juntas no destaque.
  if (!next.value) return []
  return data.value!.tasks.filter((t) => t.service.id === next.value!.service.id)
})
const later = computed(() => {
  const rest = (data.value?.tasks ?? []).filter((t) => !nextGroup.value.includes(t))
  const byDay = new Map<string, Task[]>()
  for (const t of rest) {
    const k = localDateKey(t.service.startsAt, tz.value)
    byDay.set(k, [...(byDay.get(k) ?? []), t])
  }
  return [...byDay.values()]
})
const earliestArrival = computed(() => {
  const withArrival = nextGroup.value.filter((t) => t.arrivalAt).map((t) => t.arrivalAt!)
  return withArrival.sort()[0] ?? null
})
const greeting = computed(() => {
  const h = Number(isoToLocalParts(new Date(), tz.value).time.slice(0, 2))
  const first = me.value?.account.displayName.split(' ')[0] ?? ''
  return `${h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'}, ${first}`
})
const welcome = computed(() => route.query.bemvindo === '1')
</script>

<template>
  <div class="page">
    <div class="page-head">
      <p class="kicker">
        {{ longDate(new Date().toISOString(), tz) }}
      </p>
      <h1>{{ greeting }}</h1>
    </div>

    <div
      v-if="welcome"
      class="notice notice--ok"
      style="margin-bottom:1.5rem"
    >
      <h3>Seu acesso está pronto</h3>
      <p>Aqui você vê suas tarefas, confirma presença e pede trocas. Salve esta página na tela inicial do celular para abrir mais rápido.</p>
    </div>

    <p
      v-if="error"
      class="notice notice--no"
    >
      {{ apiErrorMessage(error) }}
    </p>

    <template v-if="data">
      <div class="stack">
        <div
          v-for="a in data.availability.filter((x) => !x.responded)"
          :key="a.month"
          class="notice notice--accent"
        >
          <h3>Quais cultos de {{ monthName(a.month) }} você não pode servir?</h3>
          <p>A coordenação precisa saber até {{ longDate(a.deadlineAt, tz) }}, às {{ time(a.deadlineAt, tz) }}. Se puder em todos, responda assim mesmo.</p>
          <div class="row">
            <NuxtLink
              class="btn btn--primary btn--small"
              :to="link(`/disponibilidade/${a.month}`)"
            >Responder agora</NuxtLink>
          </div>
        </div>
        <div
          v-if="data.swapsWaiting"
          class="notice notice--wait"
        >
          <h3>{{ data.swapsWaiting === 1 ? 'Alguém pediu que você assuma uma tarefa' : `${data.swapsWaiting} pedidos para você assumir tarefas` }}</h3>
          <p>A troca só vale se você aceitar.</p>
          <div class="row">
            <NuxtLink
              class="btn btn--small"
              :to="link('/trocas')"
            >Ver pedido{{ data.swapsWaiting > 1 ? 's' : '' }}</NuxtLink>
          </div>
        </div>
      </div>

      <section
        v-if="next"
        class="section"
        aria-labelledby="proxima"
      >
        <p
          id="proxima"
          class="kicker"
          style="margin-bottom:.5rem"
        >
          Sua próxima escala · {{ relativeDay(next.service.startsAt, tz) }}
        </p>
        <article class="hero">
          <p class="hero__when">
            {{ longDate(next.service.startsAt, tz) }}
          </p>
          <p
            class="ink-2"
            style="margin-top:.25rem"
          >
            {{ next.service.title }} às {{ time(next.service.startsAt, tz) }}<template v-if="next.service.location">
              · {{ next.service.location }}
            </template>
          </p>
          <p class="hero__arrive">
            <template v-if="earliestArrival">
              Chegue às <strong>{{ time(earliestArrival, tz) }}</strong>
            </template>
            <template v-else>
              Horário de chegada <strong>a combinar</strong> com a coordenação
            </template>
          </p>
          <div
            v-for="t in nextGroup"
            :key="t.assignmentId"
            class="hero__role"
          >
            <div
              class="row row--between"
              style="align-items:baseline"
            >
              <h2 style="font-size:1.45rem">
                {{ t.duty.name }}
              </h2>
              <StatusMark :status="t.status" />
            </div>
            <p
              v-if="t.arrivalAt && nextGroup.length > 1"
              class="small ink-2"
            >
              Chegada para esta tarefa: {{ time(t.arrivalAt, tz) }}
            </p>
            <p
              v-if="t.duty.instructions"
              class="hero__instructions"
            >
              {{ t.duty.instructions }}
            </p>
            <p
              v-if="t.note"
              class="hero__instructions"
            >
              <strong>Observação:</strong> {{ t.note }}
            </p>
            <div class="hero__actions">
              <div
                v-if="t.status === 'pending'"
                class="btn-pair"
              >
                <button
                  type="button"
                  class="btn btn--ok"
                  :disabled="busy === t.assignmentId"
                  @click="respond(t, 'confirmed')"
                >
                  <Icon name="check" /> Confirmar
                </button>
                <button
                  type="button"
                  class="btn btn--no"
                  :disabled="busy === t.assignmentId"
                  @click="declining = t"
                >
                  Não posso
                </button>
              </div>
              <div
                v-else
                class="row"
              >
                <button
                  v-if="t.status === 'declined'"
                  type="button"
                  class="btn btn--small"
                  @click="respond(t, 'confirmed')"
                >
                  Posso sim, confirmar
                </button>
                <NuxtLink
                  class="btn btn--quiet btn--small"
                  :to="link(`/tarefas/${t.assignmentId}`)"
                >
                  {{ t.status === 'confirmed' ? 'Imprevisto? Pedir troca' : 'Pedir para alguém assumir' }}
                </NuxtLink>
              </div>
            </div>
          </div>
        </article>
        <p
          v-if="data.nextScript && data.nextScript.serviceId === next.service.id"
          style="margin-top:1rem"
        >
          <NuxtLink :to="link(`/roteiros/${data.nextScript.serviceId}`)"><Icon
            name="book"
            style="width:1.1rem;height:1.1rem;vertical-align:-.2em"
          /> Ver o roteiro deste culto</NuxtLink>
        </p>
      </section>

      <EmptyState
        v-else
        title="Nenhuma escala marcada para você"
        text="Quando a coordenação publicar uma escala com seu nome, ela aparece aqui e você recebe um lembrete."
      >
        <NuxtLink
          class="btn"
          :to="link('/escala')"
        >Ver a escala da igreja</NuxtLink>
      </EmptyState>

      <section
        v-if="later.length"
        class="section"
        aria-labelledby="depois"
      >
        <div class="section-head">
          <h2 id="depois">
            Depois
          </h2>
          <NuxtLink
            :to="link('/tarefas')"
            class="small"
          >Todas as suas escalas</NuxtLink>
        </div>
        <ul class="agenda">
          <li
            v-for="day in later.slice(0, 6)"
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
      </section>

      <section
        v-if="data.nextScript && (!next || data.nextScript.serviceId !== next.service.id)"
        class="section"
      >
        <div class="section-head">
          <h2>Roteiro</h2>
        </div>
        <p style="margin-top:.75rem">
          <NuxtLink :to="link(`/roteiros/${data.nextScript.serviceId}`)">{{ data.nextScript.title }} — {{ longDate(data.nextScript.startsAt, tz) }}</NuxtLink>
        </p>
      </section>

      <section
        v-if="isCoordinator"
        class="section no-print"
      >
        <div class="section-head">
          <h2>Coordenação</h2>
        </div>
        <p style="margin-top:.75rem">
          <NuxtLink :to="link('/coordenacao')">Abrir a mesa da coordenação de {{ info?.church.name }}</NuxtLink>
        </p>
      </section>
    </template>
    <DeclineSheet
      :task="declining"
      :busy="Boolean(busy)"
      @close="declining = null"
      @decline="decline"
    />
  </div>
</template>
