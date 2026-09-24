<script setup lang="ts">
import type { ScriptView, Swap } from '~/types'

useHead({ title: 'Pedido de troca' })
const route = useRoute()
const router = useRouter()
const { capi, tz, link } = useChurch()
const toast = useToast()
const { data, refresh } = await useAsyncData(`swaps-${route.params.slug}`, () => capi<{ swaps: Swap[] }>('/me/swaps'))
const busy = ref<string | null>(null)
const incoming = computed(() => (data.value?.swaps ?? []).filter((s) => s.direction === 'received' && ['proposed', 'accepted', 'rejected'].includes(s.status)))
const outgoing = computed(() => (data.value?.swaps ?? []).filter((s) => s.direction === 'sent'))
const requestedId = computed(() => typeof route.query.pedido === 'string' ? route.query.pedido : '')
const selected = computed(() => incoming.value.find((s) => s.id === requestedId.value) ?? incoming.value[0] ?? null)
const awaitingAnswer = computed(() => selected.value?.status === 'proposed')
const script = shallowRef<ScriptView | null>(null)
const scriptLoading = ref(false)
watch(() => selected.value?.serviceId, async (serviceId, _old, onCleanup) => {
  script.value = null
  if (!serviceId) return
  let stale = false
  onCleanup(() => { stale = true })
  scriptLoading.value = true
  try {
    const view = await capi<ScriptView>(`/scripts/${serviceId}`)
    if (!stale) script.value = view
  } catch {
    if (!stale) script.value = null
  } finally {
    if (!stale) scriptLoading.value = false
  }
}, { immediate: true })
const songs = computed(() => {
  const blocks = script.value?.published?.content.blocks ?? []
  return blocks.flatMap((block) => block.songs.map((song) => `${song.title}${song.musicalKey ? ` (${song.musicalKey})` : ''}`))
})
const responseStatus: Record<string, { label: string, bg: string, fg: string }> = {
  proposed: { label: 'esperando resposta', bg: '#fff1d6', fg: '#a86400' },
  accepted: { label: 'aceito', bg: '#e3f3e8', fg: '#155f30' },
  rejected: { label: 'não pôde', bg: '#f0efe9', fg: '#4a5450' },
  cancelled: { label: 'cancelado', bg: '#f0efe9', fg: '#4a5450' },
  superseded: { label: 'sem efeito', bg: '#f0efe9', fg: '#4a5450' },
}
const requestDate = (s: Swap) => shortDate(s.startsAt, tz.value)
function selectSwap(s: Swap) {
  router.replace({ query: { ...route.query, pedido: s.id } })
}

async function answer(s: Swap, accept: boolean) {
  busy.value = s.id
  try {
    await capi(`/swaps/${s.id}/${accept ? 'accept' : 'reject'}`, { method: 'POST' })
    await refresh()
    if (accept) toast.ok('Você assumiu esta tarefa. Ela já está na sua escala.')
    else toast.ok('Você respondeu que não consegue. A pessoa e a coordenação já sabem.')
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <section class="stack-lg swap-page">
    <PageHead
      :title="awaitingAnswer ? 'Pedido de troca' : selected?.status === 'accepted' ? 'Troca aceita' : selected?.status === 'rejected' ? 'Pedido de troca' : 'Pedidos de troca'"
      :lede="awaitingAnswer ? 'Confira os detalhes e responda ao pedido.' : 'Pedidos recentes e as respostas que você enviou.'"
      :back="link('/perfil')"
      back-label="Você"
    />

    <div class="swap-request-layout">
      <aside
        v-if="incoming.length"
        class="swap-request-list"
        aria-label="Pedidos para você"
      >
        <p class="caps">
          Para você
        </p>
        <div class="card card--flush rows">
          <button
            v-for="s in incoming"
            :key="s.id"
            type="button"
            class="swap-request-list__item"
            :class="{ 'swap-request-list__item--current': selected?.id === s.id }"
            :aria-current="selected?.id === s.id ? 'true' : undefined"
            @click="selectSwap(s)"
          >
            <span class="av">
              {{ initials(s.fromName) }}
            </span>
            <span class="grow">
              <strong>{{ s.fromName }}</strong>
              <small>{{ s.dutyName }} · {{ shortDate(s.startsAt, tz) }}</small>
            </span>
            <span
              class="stag"
              :style="{ background: responseStatus[s.status]?.bg, color: responseStatus[s.status]?.fg }"
            >{{ responseStatus[s.status]?.label ?? s.status }}</span>
          </button>
        </div>
      </aside>

      <main class="swap-request-main">
        <article
          v-if="selected"
          class="swap-request-card"
        >
          <header class="swap-request-card__head">
            <span class="av av--lg">{{ initials(selected.fromName) }}</span>
            <div class="grow">
              <p class="soft small">
                {{ selected.fromName }} pede para você
              </p>
              <h1>{{ awaitingAnswer ? `Você assume o ${selected.dutyName}?` : `Pedido para assumir o ${selected.dutyName}` }}</h1>
            </div>
          </header>

          <div class="swap-request-card__body">
            <div class="swap-request-date">
              <span>{{ weekdayShort(selected.startsAt, tz) }}</span>
              <strong>{{ dayNumber(selected.startsAt, tz) }}</strong>
            </div>
            <div class="grow">
              <h2>{{ selected.dutyName }} · {{ longDate(selected.startsAt, tz) }}</h2>
              <p class="soft">
                {{ selected.serviceTitle }} · {{ time(selected.startsAt, tz) }}
              </p>
            </div>
            <span
              class="stag"
              :style="{ background: responseStatus[selected.status]?.bg, color: responseStatus[selected.status]?.fg }"
            >{{ responseStatus[selected.status]?.label ?? selected.status }}</span>
          </div>

          <div class="swap-request-card__details">
            <p v-if="selected.arrivalAt">
              <Icon name="clock" />
              Chegue às <strong>{{ time(selected.arrivalAt, tz) }}</strong>
            </p>
            <p v-if="selected.location">
              <Icon name="pin" />
              {{ selected.location }}
            </p>
            <p v-if="selected.coworkers.length">
              <Icon name="people" />
              Com você: <strong>{{ selected.coworkers.join(' e ') }}</strong>
            </p>
            <p v-if="songs.length">
              <Icon name="music" />
              Músicas já escolhidas: <strong>{{ songs.join(', ') }}</strong>
            </p>
            <p
              v-else-if="scriptLoading"
              class="soft"
              role="status"
            >
              Carregando as músicas do roteiro…
            </p>
            <blockquote v-if="selected.message">
              “{{ selected.message }}” <span>— {{ selected.fromName }}</span>
            </blockquote>
          </div>

          <div
            v-if="awaitingAnswer"
            class="swap-request-card__actions"
          >
            <button
              type="button"
              class="btn"
              :disabled="busy === selected.id"
              @click="answer(selected, true)"
            >
              {{ busy === selected.id ? 'Salvando…' : `Assumo o ${selected.dutyName}` }}
            </button>
            <button
              type="button"
              class="btn btn--secondary"
              :disabled="busy === selected.id"
              @click="answer(selected, false)"
            >
              Não consigo
            </button>
            <p>Se aceitar, a tarefa passa para a sua escala e {{ selected.fromName }} e a coordenação são avisados.</p>
          </div>
          <div
            v-else-if="selected.status === 'accepted'"
            class="swap-request-result swap-request-result--ok"
            role="status"
          >
            <Icon name="check" />
            <span class="grow">Você assumiu. Está na sua escala.</span>
            <NuxtLink :to="link(`/tarefas/${selected.assignmentId}`)">
              Ver tarefa
            </NuxtLink>
          </div>
          <div
            v-else
            class="swap-request-result"
            role="status"
          >
            Você respondeu que não consegue. {{ selected.fromName }} e a coordenação já sabem.
          </div>
        </article>
        <EmptyState
          v-else
          title="Nenhum pedido para responder"
          text="Quando alguém pedir que você assuma uma tarefa, os detalhes aparecem aqui."
        />
      </main>

      <aside class="swap-request-history">
        <section v-if="outgoing.length">
          <p class="caps">
            Você pediu
          </p>
          <div class="card card--flush rows">
            <div
              v-for="s in outgoing"
              :key="s.id"
              class="rowline rowline--center"
            >
              <span class="grow">
                <strong>{{ s.dutyName }}</strong>
                <small>{{ s.candidateName }} · {{ requestDate(s) }}</small>
              </span>
              <span
                class="stag"
                :style="{ background: responseStatus[s.status]?.bg, color: responseStatus[s.status]?.fg }"
              >{{ responseStatus[s.status]?.label ?? s.status }}</span>
            </div>
          </div>
        </section>
        <section v-if="incoming.some((s) => s.status !== 'proposed')">
          <p class="caps">
            Respondidos
          </p>
          <div class="card card--flush rows">
            <div
              v-for="s in incoming.filter((item) => item.status !== 'proposed')"
              :key="s.id"
              class="rowline rowline--center"
            >
              <span class="grow">
                <strong>{{ s.fromName }}</strong>
                <small>{{ s.dutyName }} · {{ requestDate(s) }}</small>
              </span>
              <span
                class="stag"
                :style="{ background: responseStatus[s.status]?.bg, color: responseStatus[s.status]?.fg }"
              >{{ responseStatus[s.status]?.label ?? s.status }}</span>
            </div>
          </div>
        </section>
      </aside>
    </div>
  </section>
</template>
