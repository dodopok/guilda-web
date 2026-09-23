<script setup lang="ts">
import type { Swap } from '~/types'

useHead({ title: 'Pedidos de troca' })
const route = useRoute()
const { capi, tz, link } = useChurch()
const toast = useToast()
const { data, refresh } = await useAsyncData(`swaps-${route.params.slug}`, () => capi<{ swaps: Swap[] }>('/me/swaps'))
const busy = ref<string | null>(null)
// Respostas desta visita ficam na tela, com o resultado, até sair.
const answered = reactive<Record<string, 'accepted' | 'rejected'>>({})
const incoming = computed(() => (data.value?.swaps ?? []).filter((s) => s.direction === 'received' && (s.status === 'proposed' || answered[s.id])))
const outgoing = computed(() => (data.value?.swaps ?? []).filter((s) => s.direction === 'sent'))
const OUT: Record<string, { label: string, bg: string, fg: string }> = {
  proposed: { label: 'aguardando', bg: '#fff1d6', fg: '#a86400' },
  accepted: { label: 'aceito', bg: '#e3f3e8', fg: '#155f30' },
  rejected: { label: 'recusado', bg: '#f0efe9', fg: '#4a5450' },
  cancelled: { label: 'cancelado', bg: '#f0efe9', fg: '#4a5450' },
  superseded: { label: 'sem efeito', bg: '#f0efe9', fg: '#4a5450' },
}
const taskLine = (s: Swap) => `${s.dutyName} · ${weekdayShort(s.startsAt, tz.value)} ${shortDate(s.startsAt, tz.value)}, ${time(s.startsAt, tz.value)}`

async function answer(s: Swap, accept: boolean) {
  busy.value = s.id
  try {
    await capi(`/swaps/${s.id}/${accept ? 'accept' : 'reject'}`, { method: 'POST' })
    answered[s.id] = accept ? 'accepted' : 'rejected'
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
    <PageHead
      title="Pedidos de troca"
      lede="Quando alguém pede para você assumir uma tarefa — ou você pede a alguém."
      :back="link('/perfil')"
      back-label="Você"
    />
    <div>
      <p
        class="caps"
        style="margin-bottom:8px"
      >
        Para você responder
      </p>
      <div
        v-if="incoming.length"
        class="stack-sm"
        style="gap:10px"
      >
        <div
          v-for="s in incoming"
          :key="s.id"
          class="card"
        >
          <div
            class="row"
            style="gap:12px;align-items:flex-start;flex-wrap:nowrap"
          >
            <span
              class="av"
              style="width:40px;height:40px"
              aria-hidden="true"
            >{{ initials(s.fromName) }}</span>
            <span style="flex:1;min-width:0">
              <span style="display:block;font-size:15.5px"><strong>{{ s.fromName }}</strong> pede para você assumir</span>
              <span
                class="strong"
                style="display:block;font-size:17px;margin-top:2px"
              >{{ taskLine(s) }}</span>
              <span
                v-if="s.message"
                style="display:block;margin-top:8px;font-size:14.5px;color:var(--ink-2);background:var(--surface-2);border-radius:12px;padding:8px 12px"
              >“{{ s.message }}”</span>
            </span>
          </div>
          <div
            v-if="answered[s.id] === 'accepted'"
            class="row"
            role="status"
            style="gap:10px;margin-top:12px;padding:12px 14px;border-radius:14px;background:#e3f3e8;color:#155f30;font-weight:700;flex-wrap:nowrap"
          >
            <Icon
              name="check"
              :weight="2.6"
              style="width:18px;height:18px"
            />Você assumiu. {{ s.fromName }} e a coordenação já sabem.
          </div>
          <div
            v-else-if="answered[s.id] === 'rejected'"
            role="status"
            style="margin-top:12px;padding:12px 14px;border-radius:14px;background:#f0efe9;color:#4a5450;font-weight:700"
          >
            Você não pôde. {{ s.fromName }} já sabe.
          </div>
          <div
            v-else
            class="row"
            style="gap:10px;margin-top:12px"
          >
            <button
              type="button"
              class="btn"
              style="flex:1"
              :disabled="busy === s.id"
              @click="answer(s, true)"
            >
              Assumo
            </button>
            <button
              type="button"
              class="btn btn--secondary"
              style="min-height:50px;font-size:15px"
              :disabled="busy === s.id"
              @click="answer(s, false)"
            >
              Não consigo
            </button>
          </div>
        </div>
      </div>
      <div
        v-else
        class="card--dashed soft"
        style="padding:24px 20px"
      >
        Nenhum pedido esperando você.
      </div>
    </div>
    <div v-if="outgoing.length">
      <p
        class="caps"
        style="margin-bottom:8px"
      >
        Você pediu
      </p>
      <div class="card card--flush rows">
        <div
          v-for="s in outgoing"
          :key="s.id"
          class="rowline rowline--center"
        >
          <span style="flex:1;min-width:0">
            <span
              class="strong"
              style="display:block"
            >{{ taskLine(s) }}</span>
            <span
              class="soft"
              style="display:block;font-size:13.5px"
            >para {{ s.candidateName }}</span>
          </span>
          <span
            class="stag"
            :style="{ background: OUT[s.status]?.bg ?? '#f0efe9', color: OUT[s.status]?.fg ?? '#4a5450' }"
          >{{ OUT[s.status]?.label ?? s.status }}</span>
        </div>
      </div>
    </div>
  </section>
</template>
