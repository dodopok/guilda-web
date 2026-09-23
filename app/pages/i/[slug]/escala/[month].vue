<script setup lang="ts">
useHead({ title: 'Escala da igreja' })
const route = useRoute()
const month = computed(() => String(route.params.month))
const { capi, tz, link, info } = useChurch()

interface PubPerson { assignmentId: string, personId: string, name: string, status: string }
interface PubSlot { id: string, dutyName: string, arrivalAt: string | null, requiredCount: number, people: PubPerson[] }
interface PubService { id: string, title: string, startsAt: string, localDate: string, time: string, location: string | null, kind: string, status: string, slots: PubSlot[] }
interface PubMonth { month: string, monthLabel: string, published: boolean, version: number, publishedAt: string | null, services: PubService[] }

const { data } = await useAsyncData(() => `pub-${route.params.slug}-${month.value}`, () => capi<PubMonth>(`/schedule/${month.value}/published`), { watch: [month] })
const next = computed(() => shiftMonth(currentMonth(tz.value), 1))
const { data: nextInfo } = await useAsyncData(() => `pub-next-${route.params.slug}-${next.value}`, () => capi<PubMonth>(`/schedule/${next.value}/published`))
const tabs = computed(() => {
  const list = [currentMonth(tz.value), next.value]
  if (!list.includes(month.value)) list.unshift(month.value)
  return list
})
const myId = computed(() => info.value?.me.personId)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const visible = computed(() => (data.value?.services ?? []).filter((s) => s.status === 'scheduled'))
</script>

<template>
  <section class="stack-lg">
    <div
      class="row row--between"
      style="align-items:flex-end;gap:12px"
    >
      <div>
        <p class="eyebrow">
          Escala da igreja
        </p>
        <h1 class="h1--sm">
          {{ cap(monthName(month)) }}
        </h1>
      </div>
      <nav
        class="seg seg--white seg--dark"
        aria-label="Mês"
      >
        <NuxtLink
          v-for="m in tabs"
          :key="m"
          :to="link(`/escala/${m}`)"
          :aria-current="m === month ? 'page' : undefined"
        >
          {{ cap(monthName(m)) }}
          <span
            v-if="m === next && nextInfo && !nextInfo.published"
            class="tag tag--wait"
            style="font-size:11px"
          >em preparação</span>
        </NuxtLink>
      </nav>
    </div>

    <template v-if="data">
      <p
        v-if="data.published && data.publishedAt"
        class="soft"
      >
        Publicada em {{ dayMonth(data.publishedAt, tz).replace(/^1 /, '1º ') }} · Seu nome aparece destacado.
      </p>
      <p
        v-else-if="!data.published && data.services.length"
        class="panel panel--wait"
        style="border-radius:18px;padding:14px 18px"
      >
        <strong>Rascunho</strong> — só a coordenação vê. A escala aparece para todos quando for publicada.
      </p>
      <div
        v-if="!visible.length"
        class="card--dashed"
      >
        <p
          class="strong"
          style="font-size:18px"
        >
          {{ data.published ? 'Nenhum culto neste mês' : `${cap(monthName(month))} ainda está sendo montado` }}
        </p>
        <p
          class="soft"
          style="margin:6px auto 0;max-width:380px"
        >
          {{ data.published ? 'Não há cultos cadastrados.' : 'Aparece aqui quando a coordenação publicar.' }}
        </p>
      </div>
      <div class="grid-cards">
        <article
          v-for="s in visible"
          :key="s.id"
          class="card card--flush"
        >
          <div
            class="row"
            style="flex-wrap:nowrap;gap:12px;padding:14px 16px;border-bottom:1px solid var(--line-2)"
          >
            <span
              class="dtile dtile--accent"
              style="width:44px;border-radius:12px;padding:5px 0"
              aria-hidden="true"
            ><span
              class="dtile__day"
              style="font-size:20px;display:block"
            >{{ dayNumber(s.startsAt, tz) }}</span><span
              class="dtile__wd"
              style="display:block;font-size:10px"
            >{{ monthShort(s.startsAt, tz) }}</span></span>
            <div>
              <p class="strong">
                {{ cap(longDate(s.startsAt, tz)) }}
              </p>
              <p
                class="soft small"
                style="margin-top:1px"
              >
                {{ s.title }} · {{ time(s.startsAt, tz) }}
              </p>
            </div>
          </div>
          <div style="padding:6px 16px 12px">
            <div
              v-for="sl in s.slots"
              :key="sl.id"
              class="row"
              style="flex-wrap:nowrap;align-items:flex-start;gap:10px;padding:7px 0;border-bottom:1px solid var(--surface-3)"
            >
              <span
                class="grow soft small"
                style="padding-top:3px"
              >{{ sl.dutyName }}</span>
              <span
                class="row"
                style="gap:4px;justify-content:flex-end;max-width:60%"
              >
                <span
                  v-for="p in sl.people.filter((x) => x.status !== 'declined')"
                  :key="p.assignmentId"
                  class="name-pill"
                  :class="{ 'name-pill--me': p.personId === myId }"
                >{{ p.name }}</span>
                <span
                  v-if="!sl.people.filter((x) => x.status !== 'declined').length"
                  class="name-pill"
                  style="background:transparent;color:var(--muted)"
                >a definir</span>
              </span>
            </div>
          </div>
        </article>
      </div>
    </template>
  </section>
</template>
