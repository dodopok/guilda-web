<script setup lang="ts">
useHead({ title: 'Histórico' })
const route = useRoute()
const router = useRouter()
const { capi, tz, link } = useChurch()
interface Entry { id: string, action: string, entityType: string, entityId: string | null, data: Record<string, unknown>, reason: string | null, createdAt: string, actorName: string | null }
const { data } = await useAsyncData(`audit-${route.params.slug}`, () => capi<{ entries: Entry[] }>('/audit?limit=150'))

// Frases curtas, sem dados pessoais: telefones e senhas nunca entram no histórico.
const ACTIONS: Record<string, string> = {
  'person.created': 'cadastrou uma pessoa', 'person.updated': 'alterou o cadastro de uma pessoa', 'person.qualifications': 'mudou as funções de uma pessoa',
  'consent.granted': 'registrou uma autorização de WhatsApp', 'consent.revoked': 'registrou que uma pessoa não quer mais WhatsApp',
  'invite.created': 'enviou um convite', 'invite.accepted': 'aceitou o convite', 'password_reset.issued': 'pediu um link de nova senha', 'password_reset.completed': 'criou uma nova senha',
  'service.created': 'cadastrou um culto', 'service.updated': 'alterou um culto', 'service.deleted': 'apagou um culto', 'slot.created': 'acrescentou uma função num culto',
  'assignment.created': 'escalou uma pessoa', 'assignment.removed': 'tirou uma pessoa da escala', 'assignment.reassigned': 'escalou uma pessoa por exceção',
  'assignment.confirmed': 'confirmou a tarefa', 'assignment.declined': 'avisou que não pode',
  'swap.proposed': 'pediu para alguém assumir', 'swap.accepted': 'assumiu uma tarefa', 'swap.rejected': 'não pôde assumir uma tarefa',
  'schedule.published': 'publicou a escala', 'availability.scheduled': 'agendou o pedido de disponibilidade', 'availability.submitted': 'respondeu a disponibilidade', 'availability.reminded': 'lembrou quem ainda não respondeu',
  'script.created': 'criou um roteiro', 'script.updated': 'alterou um roteiro', 'script.blocks_updated': 'editou o roteiro', 'script.published': 'publicou o roteiro',
  'script.estevao_applied': 'trouxe as leituras do Estêvão', 'script.music_set': 'escolheu as músicas', 'script.music_notified': 'avisou o louvor', 'script.reader_notified': 'avisou quem lê',
  'template.created': 'criou um modelo de liturgia', 'template.updated': 'alterou um modelo de liturgia', 'whatsapp.channel_updated': 'alterou o canal do WhatsApp', 'whatsapp.coexistence': 'registrou a coexistência do número',
  'message.requeued': 'mandou uma mensagem de novo', 'church.updated': 'mudou as configurações', 'church.created': 'cadastrou a igreja', 'church.logo_updated': 'trocou o logo', 'church.logo_removed': 'tirou o logo',
  'duty.created': 'criou uma função', 'duty.updated': 'alterou uma função', 'ministry.created': 'criou um ministério', 'import.applied': 'importou a planilha antiga',
  'setup.duties': 'escolheu as funções da igreja', 'setup.completed': 'concluiu a configuração inicial',
}
type Kind = 'escala' | 'excecao' | 'consentimento' | 'configuracao' | 'cadastro'
const META: Record<Kind, { label: string, icon: string, bg: string, fg: string }> = {
  escala: { label: 'Escala', icon: 'calendar', bg: '#e3ebf8', fg: '#2f5fa8' },
  excecao: { label: 'Exceção', icon: 'alert', bg: '#fff1d6', fg: '#a86400' },
  consentimento: { label: 'Consentimento', icon: 'check', bg: '#e3f3e8', fg: '#155f30' },
  configuracao: { label: 'Configuração', icon: 'settings', bg: '#f0efe9', fg: '#4a5450' },
  cadastro: { label: 'Cadastro', icon: 'user', bg: '#f0efe9', fg: '#4a5450' },
}
function kindOf(e: Entry): Kind {
  const [group] = e.action.split('.')
  if (group === 'assignment' && (e.reason || e.action === 'assignment.reassigned' || e.data?.exceptional)) return 'excecao'
  if (group === 'consent') return 'consentimento'
  if (['assignment', 'swap', 'schedule', 'service', 'slot', 'availability', 'script', 'import'].includes(group!)) return 'escala'
  if (['person', 'invite', 'password_reset'].includes(group!)) return 'cadastro'
  return 'configuracao'
}
const entries = computed(() => (data.value?.entries ?? []).map((e) => ({ ...e, kind: kindOf(e) })))
const FILTERS: [string, string][] = [['todas', 'Tudo'], ['escala', 'Escala'], ['excecao', 'Exceções'], ['consentimento', 'Consentimentos'], ['configuracao', 'Configurações']]
const filter = computed({
  get: () => (typeof route.query.tipo === 'string' && FILTERS.some(([k]) => k === route.query.tipo) ? route.query.tipo : 'todas'),
  set: (v: string) => router.replace({ query: v === 'todas' ? {} : { tipo: v } }),
})
const list = computed(() => (filter.value === 'todas' ? entries.value : entries.value.filter((e) => e.kind === filter.value)))
const todayKey = localDateKey(new Date(), tz.value)
const days = computed(() => {
  const groups = new Map<string, typeof list.value>()
  for (const entry of list.value) {
    const key = localDateKey(entry.createdAt, tz.value)
    groups.set(key, [...(groups.get(key) ?? []), entry])
  }
  return [...groups.entries()].map(([key, items]) => {
    const sample = items[0]!
    const weekday = weekdayLong(sample.createdAt, tz.value).replace('-feira', '')
    const label = key === todayKey
      ? `Hoje, ${weekday} ${dayNumber(sample.createdAt, tz.value)}`
      : `${weekday}, ${dayNumber(sample.createdAt, tz.value)} de ${monthName(key.slice(0, 7)).toLowerCase()}`
    return { key, label, items }
  })
})
</script>

<template>
  <div class="stack-lg w-760">
    <PageHead
      title="Histórico"
      lede="Quem mudou o quê, e quando."
      :back="link('/coordenacao/configuracoes')"
      back-label="Configurações"
    />
    <div
      class="chips"
      role="group"
      aria-label="Filtrar por tipo"
    >
      <button
        v-for="[k, l] in FILTERS"
        :key="k"
        type="button"
        class="chip chip--dark"
        :aria-pressed="filter === k"
        @click="filter = k"
      >
        {{ l }} <span style="opacity:.7">{{ k === 'todas' ? entries.length : entries.filter((e) => e.kind === k).length }}</span>
      </button>
    </div>
    <div class="card card--flush">
      <section
        v-for="day in days"
        :key="day.key"
        class="audit-day"
      >
        <h2 class="caps audit-day__title">
          {{ day.label }}
        </h2>
        <div class="rows">
          <div
            v-for="e in day.items"
            :key="e.id"
            class="rowline"
            style="flex-wrap:nowrap"
          >
            <span
              style="width:36px;height:36px;border-radius:999px;display:grid;place-items:center;flex:none"
              :style="{ background: META[e.kind].bg, color: META[e.kind].fg }"
              aria-hidden="true"
            ><Icon
              :name="META[e.kind].icon"
              :weight="2"
              style="width:18px;height:18px"
            /></span>
            <span style="flex:1;min-width:0">
              <span style="display:block;font-size:15px"><strong>{{ e.actorName ?? 'O sistema' }}</strong> {{ ACTIONS[e.action] ?? e.action }}</span>
              <span
                v-if="e.reason"
                style="display:block;margin-top:6px;font-size:14px;color:#5c3a00;background:#fff1d6;border-radius:10px;padding:6px 10px"
              >Motivo: “{{ e.reason }}”</span>
              <span
                class="muted"
                style="display:block;font-size:13px;margin-top:3px"
              >{{ time(e.createdAt, tz) }} · {{ META[e.kind].label }}</span>
            </span>
          </div>
        </div>
      </section>
      <p
        v-if="!list.length"
        class="muted"
        style="padding:22px 16px;text-align:center"
      >
        Nada desse tipo ainda.
      </p>
    </div>
  </div>
</template>
