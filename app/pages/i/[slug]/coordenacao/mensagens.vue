<script setup lang="ts">
import type { MessageRow } from '~/types'

useHead({ title: 'Mensagens enviadas' })
const route = useRoute()
const router = useRouter()
const { capi, tz, link, info } = useChurch()
const toast = useToast()

interface Run {
  id: string
  scheduledFor: string
  stats: { recipients?: number, queued?: number, blocked?: number }
  deliveries: { id: string, kind: string, messageStatus: string | null, blockedReason: string | null }[]
}
const { data: out, refresh } = await useAsyncData(`outbox-${route.params.slug}`, () => capi<{ counts: Record<string, number>, messages: MessageRow[] }>('/messages?limit=200'))
const { data: rem } = await useAsyncData(`reminders-${route.params.slug}`, () => capi<{ runs: Run[] }>('/reminders'))

const filter = computed<string>({
  get: () => {
    const state = route.query.estado
    if (state === 'problems' || state === 'delivered' || state === 'queued') return state
    return problemCount.value ? 'problems' : 'todas'
  },
  set: (v: string) => router.replace({ query: v === 'todas' ? {} : { estado: v } }),
})
const rows = computed(() => (out.value?.messages ?? []).map((m) => ({ ...m, tint: messageTint(m.status) })))
const RETRY = ['blocked', 'failed', 'unknown']
const problemCount = computed(() => rows.value.filter((m) => RETRY.includes(m.status)).length)
const filters = computed(() => [
  { key: 'problems', label: 'Não saíram', n: problemCount.value },
  { key: 'queued', label: 'Na fila', n: rows.value.filter((r) => ['queued', 'sending'].includes(r.status)).length },
  { key: 'delivered', label: 'Entregues', n: rows.value.filter((r) => ['sent', 'delivered', 'read'].includes(r.status)).length },
  { key: 'todas', label: 'Todas', n: rows.value.length },
])
const list = computed(() => {
  if (filter.value === 'problems') return rows.value.filter((r) => RETRY.includes(r.status))
  if (filter.value === 'queued') return rows.value.filter((r) => ['queued', 'sending'].includes(r.status))
  if (filter.value === 'delivered') return rows.value.filter((r) => ['sent', 'delivered', 'read'].includes(r.status))
  return rows.value
})

// Só volta à fila o que não chegou (ou pode não ter chegado); reenviar o que já foi
// entregue duplicaria a mensagem.
async function retry(m: MessageRow) {
  try {
    await capi(`/messages/${m.id}/resend`, { method: 'POST' })
    toast.ok(m.status === 'unknown' ? 'De volta à fila. Confira antes se ela não chegou.' : 'Mensagem de volta à fila.')
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}

const sim = ref<{ m: MessageRow, body: string, link: string | null } | null>(null)
async function openSim(m: MessageRow) {
  try {
    const { body } = await capi<{ body: string }>(`/messages/${m.id}/simulated`)
    sim.value = { m, body, link: body.match(/https?:\/\/\S+/)?.[0] ?? null }
  } catch (e) {
    toast.error(e)
  }
}
const selectedId = ref<string | null>(null)
const selected = computed(() => list.value.find((m) => m.id === selectedId.value) ?? list.value[0] ?? null)
watch(list, (items) => {
  if (!items.some((m) => m.id === selectedId.value)) selectedId.value = items[0]?.id ?? null
  const current = items.find((m) => m.id === selectedId.value)
  if (current?.status !== 'simulated') sim.value = null
  else if (current && sim.value?.m.id !== current.id) void openSim(current)
}, { immediate: true })
function selectMessage(m: MessageRow) {
  selectedId.value = m.id
  if (m.status === 'simulated') void openSim(m)
  else sim.value = null
}

const reminderLine = computed(() => {
  const c = info.value?.church
  if (!c) return ''
  if (!c.reminderEnabled) return 'O lembrete semanal está desligado. Uma mensagem por pessoa, quando ligado.'
  return `Toda ${WEEKDAYS[c.reminderWeekday]!.replace('-feira', '')}, ${hhmm(c.reminderTime)}. Uma mensagem por pessoa.`
})
const runs = computed(() => (rem.value?.runs ?? []).map((r) => {
  const ds = r.deliveries.filter((d) => d.kind === 'reminder')
  const ok = ds.filter((d) => ['sent', 'delivered', 'read', 'simulated', 'queued', 'sending'].includes(d.messageStatus ?? '')).length
  const failed = ds.filter((d) => ['failed', 'unknown'].includes(d.messageStatus ?? '')).length
  const skipped = ds.filter((d) => d.blockedReason).length
  const simulated = ds.some((d) => d.messageStatus === 'simulated')
  let summary = `${ok} de ${ds.length} enviadas`
  if (failed) summary += `, ${plural(failed, 'falha', 'falhas')}`
  if (skipped) summary += `, ${skipped} sem autorização`
  return { id: r.id, when: stamp(r.scheduledFor, tz.value), summary, tag: simulated ? 'simulação' : ds.length ? 'oficial' : 'sem envios', sim: simulated }
}))
</script>

<template>
  <div class="stack-lg w-760">
    <PageHead
      title="Mensagens enviadas"
      lede="Tudo que saiu — ou tentou sair — pelo WhatsApp da igreja."
      :back="link('/coordenacao/configuracoes')"
      back-label="Configurações"
    />

    <div
      v-if="info?.whatsappMode === 'simulation'"
      class="panel panel--wait small"
    >
      <strong>Modo de simulação.</strong> Nada saiu de verdade: cada mensagem fica aqui para você conferir.
      <NuxtLink :to="link('/coordenacao/whatsapp')">Canal do WhatsApp</NuxtLink>
    </div>
    <div
      v-if="problemCount"
      class="panel panel--soft messages-problem-hint"
    >
      {{ plural(problemCount, 'mensagem depende', 'mensagens dependem') }} de um cadastro ou nova tentativa. Resolva o motivo e ela volta à fila.
    </div>

    <div
      class="chips"
      role="group"
      aria-label="Filtrar por estado"
    >
      <button
        v-for="f in filters"
        :key="f.key"
        type="button"
        class="chip chip--dark"
        :aria-pressed="filter === f.key"
        @click="filter = f.key"
      >
        {{ f.label }} <span style="opacity:.7">{{ f.n }}</span>
      </button>
    </div>

    <div class="messages-layout">
      <div class="card card--flush rows messages-list">
        <div
          v-for="m in list"
          :key="m.id"
          class="rowline messages-row"
          :class="{ 'messages-row--selected': selected?.id === m.id }"
          role="button"
          tabindex="0"
          :aria-current="selected?.id === m.id ? 'true' : undefined"
          @click="selectMessage(m)"
          @keydown.enter.prevent="selectMessage(m)"
          @keydown.space.prevent="selectMessage(m)"
        >
          <span
            class="av"
            style="width:40px;height:40px"
            aria-hidden="true"
          >{{ initials(m.personName ?? '?') }}</span>
          <span class="messages-row__copy">
            <span class="messages-row__top">
              <span class="strong">{{ m.personName ?? 'Sem pessoa' }}</span>
              <span
                class="stag"
                :style="{ background: m.tint.bg, color: m.tint.fg }"
              >{{ m.tint.label }}</span>
            </span>
            <span class="soft messages-row__sub">{{ m.kindLabel }} · {{ stamp(m.createdAt, tz) }}</span>
            <span
              v-if="m.blockedReasonText || m.lastError"
              class="amber messages-row__reason"
            >{{ m.blockedReasonText ?? m.lastError }}</span>
          </span>
          <button
            v-if="RETRY.includes(m.status)"
            type="button"
            class="btn btn--line btn--xs messages-row__action"
            @click.stop="retry(m)"
          >
            Tentar de novo
          </button>
          <button
            v-else-if="m.status === 'simulated'"
            type="button"
            class="link messages-row__action"
            @click.stop="selectMessage(m)"
          >
            Ver mensagem
          </button>
        </div>
        <p
          v-if="!list.length"
          class="muted"
          style="padding:22px 16px;text-align:center"
        >
          {{ rows.length ? 'Nenhuma mensagem com esse filtro.' : 'Nenhuma mensagem ainda.' }}
        </p>
      </div>

      <aside class="messages-aside">
        <div
          v-if="selected"
          class="card messages-detail"
        >
          <p class="caps">
            Detalhe
          </p>
          <div
            class="row"
            style="gap:10px;margin-top:10px"
          >
            <span
              class="av"
              aria-hidden="true"
            >{{ initials(selected.personName ?? '?') }}</span>
            <span class="grow"><strong>{{ selected.personName ?? 'Sem pessoa' }}</strong><span class="messages-detail__sub">{{ selected.kindLabel }} · {{ stamp(selected.createdAt, tz) }}</span></span>
            <span
              class="stag"
              :style="{ background: selected.tint.bg, color: selected.tint.fg }"
            >{{ selected.tint.label }}</span>
          </div>
          <div
            v-if="selected.blockedReasonText || selected.lastError"
            class="panel panel--wait messages-detail__reason"
          >
            <strong>Por que não saiu</strong>
            <p style="margin-top:3px">
              {{ selected.blockedReasonText ?? selected.lastError }}
            </p>
          </div>
          <div
            v-if="RETRY.includes(selected.status)"
            class="row messages-detail__actions"
          >
            <button
              type="button"
              class="btn btn--sm"
              @click="retry(selected)"
            >
              Tentar de novo
            </button>
            <NuxtLink
              v-if="selected.personId"
              :to="link('/coordenacao/pessoas')"
              class="link"
            >Abrir pessoas</NuxtLink>
          </div>
          <template v-if="selected.status === 'simulated'">
            <p
              class="caps"
              style="margin-top:16px"
            >
              O que seria enviado
            </p>
            <p
              v-if="sim?.m.id === selected.id"
              class="bubble messages-detail__bubble"
            >
              {{ sim.body }}
            </p>
            <button
              v-else
              type="button"
              class="btn btn--secondary btn--sm"
              style="margin-top:8px"
              @click="openSim(selected)"
            >
              Ver mensagem simulada
            </button>
            <a
              v-if="sim?.m.id === selected.id && sim.link"
              :href="sim.link"
              target="_blank"
              rel="noopener noreferrer"
              class="messages-detail__url"
            >{{ sim.link }}</a>
          </template>
          <template v-else-if="selected.preview">
            <p
              class="caps"
              style="margin-top:16px"
            >
              Prévia
            </p>
            <p class="messages-detail__preview">
              {{ selected.preview }}
            </p>
          </template>
          <div class="messages-timeline">
            <p><span>Criada</span><strong>{{ stamp(selected.createdAt, tz) }}</strong></p>
            <p v-if="selected.sentAt">
              <span>Enviada</span><strong>{{ stamp(selected.sentAt, tz) }}</strong>
            </p>
            <p v-if="selected.deliveredAt">
              <span>Entregue</span><strong>{{ stamp(selected.deliveredAt, tz) }}</strong>
            </p>
            <p v-if="selected.readAt">
              <span>Lida</span><strong>{{ stamp(selected.readAt, tz) }}</strong>
            </p>
          </div>
        </div>

        <div class="card messages-reminders">
          <h2 style="font-size:18px">
            Lembrete semanal
          </h2>
          <p
            class="soft"
            style="margin:2px 0 8px;font-size:14px"
          >
            {{ reminderLine }}
          </p>
          <div
            v-for="r in runs"
            :key="r.id"
            class="messages-run"
          >
            <span><strong>{{ r.when }}</strong><small>{{ r.summary }}</small></span>
            <span
              class="stag"
              :style="r.sim ? { background: '#efe6fb', color: '#5b3aa6' } : { background: '#e3f3e8', color: '#155f30' }"
            >{{ r.tag }}</span>
          </div>
          <p
            v-if="!runs.length"
            class="muted small"
            style="padding-top:6px"
          >
            Nenhum lembrete saiu ainda.
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>
