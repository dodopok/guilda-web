<script setup lang="ts">
useHead({ title: 'Escala' })
const route = useRoute()
const router = useRouter()
const { capi, tz, link, info, isCoordinator } = useChurch()

interface PubPerson { assignmentId: string, personId: string, name: string, status: string }
interface PubSlot { id: string, dutyName: string, arrivalAt: string | null, requiredCount: number, people: PubPerson[] }
interface PubService { id: string, title: string, startsAt: string, localDate: string, time: string, location: string | null, kind: string, status: string, slots: PubSlot[] }
interface PubMonth { month: string, monthLabel: string, published: boolean, version?: number, services: PubService[] }

const month = computed({
  get: () => String(route.params.month),
  set: (v: string) => router.replace(link(`/escala/${v}`)),
})
const { data } = await useAsyncData(() => `pub-${route.params.slug}-${month.value}`, () => capi<PubMonth>(`/schedule/${month.value}/published`), { watch: [month] })
const myId = computed(() => info.value?.me.personId)
const onlyMine = ref(false)
const services = computed(() => (data.value?.services ?? []).map((s) => ({
  ...s,
  mine: s.slots.some((sl) => sl.people.some((p) => p.personId === myId.value)),
})).filter((s) => !onlyMine.value || s.mine))
const dutyRows = computed(() => {
  const seen: string[] = []
  for (const s of services.value) for (const sl of s.slots) if (!seen.includes(sl.dutyName)) seen.push(sl.dutyName)
  return seen
})
</script>

<template>
  <div class="page page--wide">
    <div class="page-head">
      <p class="kicker">
        Escala da igreja
      </p>
      <div class="row row--between">
        <h1>Escala</h1>
        <MonthSwitch
          v-model="month"
          class="no-print"
        />
      </div>
      <p
        v-if="data?.published === false && !isCoordinator"
        class="lede"
      >
        A escala de {{ monthName(month) }} ainda não foi publicada.
      </p>
      <p
        v-else-if="data && !data.published && isCoordinator"
        class="lede"
      >
        Rascunho — só a coordenação vê. <NuxtLink :to="link(`/coordenacao/escalas/${month}`)">Abrir no editor</NuxtLink>
      </p>
    </div>
    <div
      v-if="services.length || onlyMine"
      class="row no-print"
      style="margin-bottom:1rem"
    >
      <label
        class="check"
        style="padding:0"
      ><input
        v-model="onlyMine"
        type="checkbox"
      > <span>Só os cultos em que eu sirvo</span></label>
      <span class="spacer" />
      <button
        type="button"
        class="btn btn--small"
        onclick="window.print()"
      >
        <Icon name="print" /> Imprimir
      </button>
    </div>
    <EmptyState
      v-if="data?.published !== false && !services.length"
      :title="onlyMine ? 'Você não está nesta escala' : 'Nenhum culto neste mês'"
    />
    <div
      v-if="services.length"
      class="only-wide grid-wrap"
      style="margin-bottom:2rem"
    >
      <table class="grid">
        <caption class="sr-only">
          Escala de {{ monthLabel(month) }} em grade
        </caption>
        <thead>
          <tr>
            <th scope="col">
              Função
            </th>
            <th
              v-for="s in services"
              :key="s.id"
              scope="col"
              class="col-date"
            >
              <div class="w">
                {{ weekdayShort(s.startsAt, tz) }} · {{ time(s.startsAt, tz) }}
              </div>
              <div class="d">
                {{ dayNumber(s.startsAt, tz) }} <span
                  class="small muted"
                  style="font-family:var(--sans)"
                >{{ monthShort(s.startsAt, tz) }}</span>
              </div>
              <div
                v-if="s.kind !== 'regular' || s.status === 'cancelled'"
                class="small muted"
              >
                {{ s.status === 'cancelled' ? 'cancelado' : s.title }}
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="duty in dutyRows"
            :key="duty"
          >
            <th scope="row">
              {{ duty }}
            </th>
            <td
              v-for="s in services"
              :key="s.id"
              style="padding:.45rem .6rem"
            >
              <template
                v-for="sl in s.slots.filter((x) => x.dutyName === duty)"
                :key="sl.id"
              >
                <div
                  v-for="p in sl.people"
                  :key="p.assignmentId"
                  class="cell__person"
                >
                  <span :class="{ 'me-mark': p.personId === myId }">{{ p.name }}</span>
                  <StatusMark
                    :status="p.status"
                    short
                  />
                </div>
                <span
                  v-if="!sl.people.length"
                  class="muted"
                >—</span>
              </template>
              <span
                v-if="!s.slots.some((x) => x.dutyName === duty)"
                class="muted"
                aria-label="sem este posto"
              >·</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <section
      v-for="s in services"
      :key="s.id"
      class="section only-narrow"
      style="margin-top:1.75rem"
    >
      <div class="section-head">
        <h2>{{ longDate(s.startsAt, tz) }}</h2>
        <span class="ink-2">{{ s.title }} · {{ time(s.startsAt, tz) }}</span>
      </div>
      <p
        v-if="s.status === 'cancelled'"
        class="notice notice--no"
        style="margin-top:.5rem"
      >
        Culto cancelado.
      </p>
      <table
        v-else
        class="table"
        style="margin-top:.25rem"
      >
        <caption class="sr-only">
          Escala de {{ longDate(s.startsAt, tz) }}
        </caption>
        <tbody>
          <tr
            v-for="sl in s.slots"
            :key="sl.id"
          >
            <th
              scope="row"
              style="width:40%;font-weight:700"
            >
              {{ sl.dutyName }}
              <span
                v-if="sl.arrivalAt"
                class="muted small"
                style="display:block;font-weight:400"
              >chegar {{ time(sl.arrivalAt, tz) }}</span>
            </th>
            <td>
              <span
                v-if="!sl.people.length"
                class="muted"
              >—</span>
              <span
                v-for="(p, i) in sl.people"
                :key="p.assignmentId"
                :style="p.personId === myId ? 'background:var(--accent-wash);padding:0 .25rem;border-radius:3px' : ''"
              >
                <strong v-if="p.personId === myId">{{ p.name }} (você)</strong><template v-else>{{ p.name }}</template>
                <StatusMark
                  :status="p.status"
                  short
                /><template v-if="i < sl.people.length - 1">, </template>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>
