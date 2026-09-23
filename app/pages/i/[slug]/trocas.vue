<script setup lang="ts">
import type { Swap } from '~/types'

useHead({ title: 'Pedidos de troca' })
const route = useRoute()
const { capi, tz } = useChurch()
const toast = useToast()
const { data, refresh } = await useAsyncData(`swaps-${route.params.slug}`, () => capi<{ swaps: Swap[] }>('/me/swaps'))
const busy = ref<string | null>(null)
const received = computed(() => (data.value?.swaps ?? []).filter((s) => s.direction === 'received' && s.status === 'proposed'))
const others = computed(() => (data.value?.swaps ?? []).filter((s) => !(s.direction === 'received' && s.status === 'proposed')))
const STATUS: Record<string, string> = { proposed: 'aguardando resposta', accepted: 'aceita — troca feita', rejected: 'recusada', cancelled: 'cancelada', superseded: 'sem efeito (a tarefa mudou)' }

async function answer(s: Swap, accept: boolean) {
  busy.value = s.id
  try {
    await capi(`/swaps/${s.id}/${accept ? 'accept' : 'reject'}`, { method: 'POST' })
    toast.ok(accept ? `Pronto: ${s.dutyName} agora é sua tarefa, já confirmada.` : `Você recusou. ${s.fromName} continua com a tarefa.`)
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = null
    await refresh()
  }
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <p class="kicker">
        Trocas
      </p>
      <h1>Pedidos de troca</h1>
    </div>
    <EmptyState
      v-if="!received.length && !others.length"
      title="Nenhum pedido"
      text="Quando alguém pedir que você assuma uma tarefa, o pedido aparece aqui."
    />
    <section v-if="received.length">
      <div class="section-head">
        <h2>Para você responder</h2>
      </div>
      <ul class="lines">
        <li
          v-for="s in received"
          :key="s.id"
        >
          <p><strong>{{ s.fromName }}</strong> pediu que você assuma <strong>{{ s.dutyName }}</strong></p>
          <p class="ink-2">
            {{ longDate(s.startsAt, tz) }}, {{ s.serviceTitle }} às {{ time(s.startsAt, tz) }}<template v-if="s.location">
              · {{ s.location }}
            </template>
          </p>
          <p
            v-if="s.message"
            class="ink-2"
            style="margin-top:.35rem"
          >
            “{{ s.message }}”
          </p>
          <div
            class="btn-pair"
            style="margin-top:.9rem;max-width:26rem"
          >
            <button
              type="button"
              class="btn btn--ok"
              :disabled="busy === s.id"
              @click="answer(s, true)"
            >
              <Icon name="check" /> Aceitar
            </button>
            <button
              type="button"
              class="btn"
              :disabled="busy === s.id"
              @click="answer(s, false)"
            >
              Não posso
            </button>
          </div>
        </li>
      </ul>
    </section>
    <section
      v-if="others.length"
      class="section"
    >
      <div class="section-head">
        <h2>Anteriores</h2>
      </div>
      <ul class="lines lines--tight">
        <li
          v-for="s in others"
          :key="s.id"
          class="line"
        >
          <span class="line__main">
            <span class="line__title">{{ s.dutyName }} · {{ shortDate(s.startsAt, tz) }}</span>
            <span
              class="line__sub"
              style="display:block"
            >{{ s.direction === 'sent' ? `Você pediu a ${s.candidateName}` : `${s.fromName} pediu a você` }} — {{ STATUS[s.status] ?? s.status }}</span>
          </span>
        </li>
      </ul>
    </section>
  </div>
</template>
