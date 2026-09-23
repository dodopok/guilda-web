<script setup lang="ts">
import type { MessageRow } from '~/types'

useHead({ title: 'Mensagens' })
const route = useRoute()
const router = useRouter()
const { capi, tz, link, info } = useChurch()
const toast = useToast()

const tab = computed({
  get: () => (route.query.status ? 'saida' : String(route.query.aba ?? 'lembretes')),
  set: (v: string) => router.replace({ query: { aba: v } }),
})
const statusFilter = computed(() => (typeof route.query.status === 'string' ? route.query.status : ''))

interface Preview {
  enabled: boolean
  nextRunAt: string
  windowStart: string
  windowEnd: string
  channel: { mode: string, canSendReal: boolean }
  recipients: { personId: string, displayName: string, taskCount: number, pending: string | null, message: string }[]
}
interface Run {
  id: string
  scheduledFor: string
  windowStart: string
  windowEnd: string
  trigger: string
  status: string
  stats: { recipients?: number, queued?: number, blocked?: number }
  deliveries: { id: string, personName: string, seq: number, kind: string, createdAt: string, messageStatus: string | null, blockedReason: string | null, lastError: string | null, messageId: string | null }[]
}
const { data: rem, refresh: refreshRem } = await useAsyncData(`reminders-${route.params.slug}`, () => capi<{ preview: Preview, runs: Run[] }>('/reminders'))
const { data: out, refresh: refreshOut } = await useAsyncData(() => `outbox-${route.params.slug}-${statusFilter.value}`, () => capi<{ counts: Record<string, number>, messages: MessageRow[] }>(`/messages${statusFilter.value ? `?status=${statusFilter.value}` : ''}`), { watch: [statusFilter] })

const problemCount = computed(() => (out.value?.counts.failed ?? 0) + (out.value?.counts.unknown ?? 0))
const sample = ref<string | null>(null)
const sampleOpen = computed({ get: () => sample.value !== null, set: (v) => { if (!v) sample.value = null } })
const PENDING: Record<string, string> = { no_phone: 'sem telefone', no_consent: 'sem autorização de WhatsApp' }
const KIND: Record<string, string> = { reminder: 'lembrete', correction: 'correção', silent: 'atualização silenciosa (recusa da própria pessoa)' }

async function resend(m: MessageRow) {
  try {
    await capi(`/messages/${m.id}/resend`, { method: 'POST' })
    toast.ok(m.status === 'unknown' ? 'Mensagem de volta à fila. Confira antes se ela não chegou.' : 'Mensagem de volta à fila.')
    await Promise.all([refreshOut(), refreshRem()])
  } catch (e) {
    toast.error(e)
  }
}
const simText = ref<string | null>(null)
const simOpen = computed({ get: () => simText.value !== null, set: (v) => { if (!v) simText.value = null } })
async function showSim(m: MessageRow) {
  try {
    simText.value = (await capi<{ body: string }>(`/messages/${m.id}/simulated`)).body
  } catch (e) {
    toast.error(e)
  }
}
function setStatus(v: string) {
  router.replace({ query: v ? { status: v } : { aba: 'saida' } })
}
const FILTERS = [
  { v: '', l: 'Todas' },
  { v: 'blocked', l: 'Não enviadas' },
  { v: 'failed,unknown', l: 'Com falha' },
  { v: 'queued,sending', l: 'Na fila' },
  { v: 'sent,delivered,read', l: 'Enviadas' },
  { v: 'simulated', l: 'Simuladas' },
]
</script>

<template>
  <div class="page page--wide">
    <NuxtLink
      :to="`/i/${$route.params.slug}/coordenacao/configuracoes`"
      class="back"
    >
      <Icon
        name="arrow-left"
        :weight="2"
      />Configurações
    </NuxtLink>
    <div class="page-head">
      <p class="kicker">
        Comunicação
      </p>
      <h1>Mensagens</h1>
      <p class="lede">
        Tudo que a Guilda enviou ou tentou enviar pelo WhatsApp, com o motivo quando algo não saiu.
      </p>
      <div
        v-if="info?.whatsappMode === 'simulation'"
        class="notice notice--wait"
        style="margin-top:1rem"
      >
        <p><strong>Modo de simulação.</strong> As mensagens aparecem como “Simulada — não enviada”: ninguém recebe nada. <NuxtLink :to="link('/coordenacao/whatsapp')">Ver o que falta para o canal oficial</NuxtLink>.</p>
      </div>
    </div>

    <div
      class="row"
      role="tablist"
      aria-label="Seções"
      style="gap:.25rem;margin-bottom:1.5rem;border-bottom:1px solid var(--rule);padding-bottom:.5rem"
    >
      <button
        role="tab"
        type="button"
        class="btn btn--small"
        :class="{ 'btn--primary': tab === 'lembretes' }"
        :aria-selected="tab === 'lembretes'"
        @click="tab = 'lembretes'"
      >
        Lembrete semanal
      </button>
      <button
        role="tab"
        type="button"
        class="btn btn--small"
        :class="{ 'btn--primary': tab === 'saida' }"
        :aria-selected="tab === 'saida'"
        @click="tab = 'saida'"
      >
        Todas as mensagens
        <span
          v-if="problemCount"
          class="badge-count"
        >{{ problemCount }}</span>
      </button>
    </div>

    <!-- Lembretes -->
    <template v-if="tab === 'lembretes' && rem">
      <section>
        <div class="section-head">
          <h2>Próximo lembrete</h2>
          <NuxtLink
            class="small"
            :to="link('/coordenacao/configuracoes')"
          >Mudar dia e horário</NuxtLink>
        </div>
        <p
          v-if="!rem.preview.enabled"
          class="notice notice--wait"
          style="margin-top:.75rem"
        >
          O lembrete semanal está desligado. <NuxtLink :to="link('/coordenacao/configuracoes')">Ligar</NuxtLink>
        </p>
        <p style="margin-top:.75rem;font-size:1.1rem">
          <strong>{{ longDate(rem.preview.nextRunAt, tz) }}, às {{ time(rem.preview.nextRunAt, tz) }}</strong>,
          com as tarefas até {{ longDate(rem.preview.windowEnd, tz) }}.
        </p>
        <p class="ink-2">
          {{ plural(rem.preview.recipients.length, 'pessoa escalada', 'pessoas escaladas') }} na janela ·
          {{ rem.preview.recipients.filter((r) => !r.pending).length }} receberão ·
          <strong :style="rem.preview.recipients.some((r) => r.pending) ? 'color:var(--wait)' : ''">{{ rem.preview.recipients.filter((r) => r.pending).length }} ficam de fora</strong>
        </p>
        <ul
          class="lines"
          style="margin-top:1rem"
        >
          <li
            v-for="r in rem.preview.recipients"
            :key="r.personId"
            class="line"
          >
            <span class="line__main">
              <span class="line__title">{{ r.displayName }}</span>
              <span class="line__sub"> · {{ plural(r.taskCount, 'tarefa', 'tarefas') }}</span>
              <span
                v-if="r.pending"
                class="tag tag--wait"
                style="margin-left:.4rem"
              >{{ PENDING[r.pending] }}</span>
            </span>
            <button
              type="button"
              class="btn btn--quiet btn--small"
              @click="sample = r.message"
            >
              Ver mensagem
            </button>
          </li>
          <li
            v-if="!rem.preview.recipients.length"
            class="muted"
          >
            Ninguém escalado (em escala publicada) nessa janela.
          </li>
        </ul>
      </section>

      <section class="section">
        <div class="section-head">
          <h2>Envios anteriores</h2>
        </div>
        <EmptyState
          v-if="!rem.runs.length"
          title="Nenhum lembrete enviado ainda"
          text="O trabalhador cria o envio no dia e horário configurados. Repetir o processamento não duplica mensagens."
        />
        <details
          v-for="run in rem.runs"
          :key="run.id"
          style="border-bottom:1px solid var(--rule);padding:.85rem 0"
        >
          <summary style="cursor:pointer">
            <strong>{{ longDate(run.scheduledFor, tz) }}, {{ time(run.scheduledFor, tz) }}</strong>
            <span class="ink-2"> · {{ plural(run.stats.recipients ?? 0, 'pessoa', 'pessoas') }}{{ run.stats.blocked ? `, ${run.stats.blocked} de fora` : '' }}{{ run.deliveries.some((d) => d.kind === 'correction') ? ` · ${plural(run.deliveries.filter((d) => d.kind === 'correction').length, 'correção', 'correções')}` : '' }}</span>
          </summary>
          <table
            class="table small"
            style="margin-top:.5rem"
          >
            <thead>
              <tr>
                <th scope="col">
                  Pessoa
                </th><th scope="col">
                  Tipo
                </th><th scope="col">
                  Quando
                </th><th scope="col">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="d in run.deliveries"
                :key="d.id"
              >
                <th
                  scope="row"
                  style="font-weight:600"
                >
                  {{ d.personName }}
                </th>
                <td>{{ KIND[d.kind] ?? d.kind }}</td>
                <td>{{ dateTime(d.createdAt, tz) }}</td>
                <td>
                  <MessageStatus
                    v-if="d.messageStatus"
                    :status="d.messageStatus"
                  /> <span
                    v-if="d.blockedReason"
                    class="muted"
                  >{{ PENDING[d.blockedReason] ?? d.blockedReason }}</span><span
                    v-if="d.lastError"
                    style="color:var(--no)"
                  > {{ d.lastError }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </details>
      </section>
    </template>

    <!-- Caixa de saída -->
    <template v-if="tab === 'saida' && out">
      <div
        class="row"
        role="group"
        aria-label="Filtrar por estado"
        style="gap:.25rem;margin-bottom:1rem"
      >
        <button
          v-for="f in FILTERS"
          :key="f.v"
          type="button"
          class="btn btn--small"
          :class="{ 'btn--primary': statusFilter === f.v }"
          :aria-pressed="statusFilter === f.v"
          @click="setStatus(f.v)"
        >
          {{ f.l }}
        </button>
      </div>
      <EmptyState
        v-if="!out.messages.length"
        title="Nenhuma mensagem aqui"
      />
      <ul
        v-else
        class="lines"
      >
        <li
          v-for="m in out.messages"
          :key="m.id"
        >
          <div class="line">
            <span class="line__main">
              <span class="line__title">{{ m.kindLabel }}</span>
              <span class="line__sub"> · {{ m.personName ?? '—' }}{{ m.toPhoneLast4 ? ` (final ${m.toPhoneLast4})` : '' }} · {{ dateTime(m.createdAt, tz) }}</span>
            </span>
            <MessageStatus :status="m.status" />
          </div>
          <p
            class="small ink-2"
            style="margin-top:.35rem"
          >
            {{ m.preview }}
          </p>
          <p
            v-if="m.blockedReasonText"
            class="small"
            style="margin-top:.25rem;color:var(--wait)"
          >
            {{ m.blockedReasonText }}
          </p>
          <p
            v-if="m.lastError"
            class="small"
            style="margin-top:.25rem;color:var(--no)"
          >
            {{ m.lastError }}{{ m.attempts > 1 ? ` (${m.attempts} tentativas)` : '' }}
          </p>
          <p
            v-if="m.deliveredAt || m.readAt"
            class="small muted"
          >
            {{ m.readAt ? `Lida em ${dateTime(m.readAt, tz)}` : `Entregue em ${dateTime(m.deliveredAt!, tz)}` }}
          </p>
          <div
            v-if="['blocked', 'failed', 'unknown'].includes(m.status) || m.status === 'simulated'"
            class="row"
            style="margin-top:.5rem"
          >
            <button
              v-if="['blocked', 'failed', 'unknown'].includes(m.status)"
              type="button"
              class="btn btn--small"
              @click="resend(m)"
            >
              {{ m.status === 'blocked' ? 'Tentar de novo' : 'Reenviar' }}
            </button>
            <button
              v-if="m.status === 'simulated'"
              type="button"
              class="btn btn--quiet btn--small"
              @click="showSim(m)"
            >
              Ver texto completo
            </button>
          </div>
        </li>
      </ul>
    </template>

    <Sheet
      v-model:open="sampleOpen"
      title="Prévia da mensagem"
    >
      <p style="white-space:pre-line">
        {{ sample }}
      </p>
      <p
        class="small muted"
        style="margin-top:1rem"
      >
        O texto final segue o modelo aprovado na Meta. O link individual só aparece na mensagem enviada.
      </p>
    </Sheet>
    <Sheet
      v-model:open="simOpen"
      title="Mensagem simulada"
    >
      <p class="tag tag--sim">
        Simulação — não foi enviada
      </p>
      <p style="margin-top:1rem;white-space:pre-line;word-break:break-word">
        {{ simText }}
      </p>
    </Sheet>
  </div>
</template>
