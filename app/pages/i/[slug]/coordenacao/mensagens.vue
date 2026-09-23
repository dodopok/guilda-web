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

const filter = computed({
  get: () => (typeof route.query.estado === 'string' && route.query.estado in MESSAGE_TINT ? route.query.estado : 'todas'),
  set: (v: string) => router.replace({ query: v === 'todas' ? {} : { estado: v } }),
})
const rows = computed(() => (out.value?.messages ?? []).map((m) => ({ ...m, tint: messageTint(m.status) })))
const filters = computed(() => [
  { key: 'todas', label: 'Todas', n: rows.value.length },
  ...Object.entries(MESSAGE_TINT).map(([key, t]) => ({ key, label: t.label, n: rows.value.filter((r) => r.tint.key === key).length })),
])
const list = computed(() => (filter.value === 'todas' ? rows.value : rows.value.filter((r) => r.tint.key === filter.value)))

// Só volta à fila o que não chegou (ou pode não ter chegado); reenviar o que já foi
// entregue duplicaria a mensagem.
const RETRY = ['blocked', 'failed', 'unknown']
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
const simOpen = computed({ get: () => sim.value !== null, set: (v) => { if (!v) sim.value = null } })
async function openSim(m: MessageRow) {
  try {
    const { body } = await capi<{ body: string }>(`/messages/${m.id}/simulated`)
    sim.value = { m, body, link: body.match(/https?:\/\/\S+/)?.[0] ?? null }
  } catch (e) {
    toast.error(e)
  }
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

    <div class="card card--flush rows">
      <div
        v-for="m in list"
        :key="m.id"
        class="rowline"
      >
        <span
          class="av"
          style="width:40px;height:40px"
          aria-hidden="true"
        >{{ initials(m.personName ?? '?') }}</span>
        <span style="flex:1;min-width:180px">
          <span
            class="row"
            style="gap:8px"
          >
            <span class="strong">{{ m.personName ?? 'Sem pessoa' }}</span>
            <span
              class="stag"
              :style="{ background: m.tint.bg, color: m.tint.fg }"
            >{{ m.tint.label }}</span>
          </span>
          <span
            class="soft"
            style="display:block;font-size:13.5px"
          >{{ m.kindLabel }} · {{ stamp(m.createdAt, tz) }}</span>
          <span
            v-if="m.blockedReasonText || m.lastError"
            class="amber"
            style="display:block;font-size:13.5px;margin-top:2px"
          >{{ m.blockedReasonText ?? m.lastError }}</span>
        </span>
        <span
          class="row"
          style="gap:6px"
        >
          <button
            v-if="RETRY.includes(m.status)"
            type="button"
            class="btn btn--line btn--xs"
            @click="retry(m)"
          >
            Tentar de novo
          </button>
          <button
            v-if="m.status === 'simulated'"
            type="button"
            class="link"
            style="font-size:13.5px"
            @click="openSim(m)"
          >
            Ver mensagem simulada
          </button>
        </span>
      </div>
      <p
        v-if="!list.length"
        class="muted"
        style="padding:22px 16px;text-align:center"
      >
        {{ rows.length ? 'Nenhuma mensagem com esse status.' : 'Nenhuma mensagem ainda.' }}
      </p>
    </div>

    <div class="card">
      <h2 style="font-size:18px">
        Lembretes semanais
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
        class="row"
        style="gap:10px;padding:10px 0;border-top:1px solid var(--line-2)"
      >
        <span
          class="strong"
          style="min-width:140px;font-weight:700"
        >{{ r.when }}</span>
        <span
          class="soft"
          style="flex:1;min-width:160px;font-size:14px"
        >{{ r.summary }}</span>
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

    <Sheet
      v-model:open="simOpen"
      label="Mensagem simulada"
    >
      <template
        v-if="sim"
        #head
      >
        <p class="caps">
          Mensagem simulada
        </p>
        <h2
          class="sheet__title"
          style="margin-top:2px"
        >
          Para {{ sim.m.personName ?? 'sem pessoa' }}
        </h2>
        <p class="sheet__lede">
          {{ sim.m.kindLabel }} · {{ stamp(sim.m.createdAt, tz) }} · nada saiu de verdade
        </p>
      </template>
      <template v-if="sim">
        <div
          class="bubble"
          style="background:#e7f6e4;border-radius:18px 18px 18px 4px;font-size:15.5px;max-width:none;white-space:pre-line;word-break:break-word"
        >
          {{ sim.body }}
        </div>
        <div
          v-if="sim.link"
          class="row"
          style="margin-top:12px;gap:8px;background:var(--surface-2);border-radius:12px;padding:10px 12px"
        >
          <span
            class="soft"
            style="font-size:13.5px"
          >Link dentro da mensagem</span>
          <a
            :href="sim.link"
            target="_blank"
            rel="noopener noreferrer"
            class="strong"
            style="color:var(--accent-deep);word-break:break-all"
          >{{ sim.link }}</a>
        </div>
      </template>
    </Sheet>
  </div>
</template>
