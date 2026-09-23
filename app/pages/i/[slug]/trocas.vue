<script setup lang="ts">
import type { Swap } from '~/types'

useHead({ title: 'Pedidos de troca' })
const route = useRoute()
const { capi, tz, link } = useChurch()
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
  <section class="stack-lg w-640">
    <BackLink
      :to="link('')"
      label="Início"
    />
    <div>
      <h1 class="h1--sm">
        Pedidos de troca
      </h1>
      <p class="lede">
        A troca só vale quando a pessoa convidada aceita.
      </p>
    </div>
    <div
      v-if="!received.length && !others.length"
      class="card--dashed"
    >
      <p
        class="strong"
        style="font-size:18px"
      >
        Nenhum pedido
      </p>
      <p
        class="soft"
        style="margin:6px auto 0;max-width:380px"
      >
        Quando alguém pedir que você assuma uma tarefa, o pedido aparece aqui.
      </p>
    </div>
    <section
      v-if="received.length"
      class="stack-sm"
    >
      <p class="section-label">
        Para você responder
      </p>
      <article
        v-for="s in received"
        :key="s.id"
        class="card card--lg stack-sm"
      >
        <p style="font-size:17px">
          <strong>{{ s.fromName }}</strong> pediu que você assuma <strong>{{ s.dutyName }}</strong>
        </p>
        <p class="soft">
          {{ s.serviceTitle }} · {{ longDate(s.startsAt, tz) }}, {{ time(s.startsAt, tz) }}<template v-if="s.location">
            · {{ s.location }}
          </template>
        </p>
        <p
          v-if="s.message"
          class="note"
        >
          “{{ s.message }}”
        </p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px">
          <button
            type="button"
            class="btn btn--ok"
            style="min-height:48px"
            :disabled="busy === s.id"
            @click="answer(s, true)"
          >
            <Icon
              name="check"
              :weight="2.2"
            />Aceitar
          </button>
          <button
            type="button"
            class="btn btn--secondary"
            style="min-height:48px"
            :disabled="busy === s.id"
            @click="answer(s, false)"
          >
            Não posso
          </button>
        </div>
      </article>
    </section>
    <section
      v-if="others.length"
      class="stack-sm"
    >
      <p class="section-label">
        Histórico
      </p>
      <div class="card card--flush list">
        <div
          v-for="s in others"
          :key="s.id"
          style="padding:12px 16px"
        >
          <p style="font-weight:700">
            {{ s.direction === 'sent' ? `Você pediu a ${s.candidateName}` : `${s.fromName} pediu a você` }}: {{ s.dutyName }}
          </p>
          <p class="soft small">
            {{ longDate(s.startsAt, tz) }} · {{ STATUS[s.status] ?? s.status }}
          </p>
        </div>
      </div>
    </section>
  </section>
</template>
