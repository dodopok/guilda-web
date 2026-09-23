<script setup lang="ts">
useHead({ title: 'Mesa da coordenação' })
const route = useRoute()
const { capi, link, tz, info } = useChurch()

interface MonthInfo {
  month: string
  monthLabel: string
  services: number
  firstServiceAt: string | null
  schedule: { status: string, version: number, publishedAt: string | null }
  availability: { status: string, sendAt: string, deadlineAt: string, responses: number } | null
}
interface Overview {
  counts: { duties: number, people: number, qualifiedPeople: number, withPhone: number, withConsent: number, withAccount: number, templates: number }
  months: MonthInfo[]
  whatsapp: { mode: string, coexistence: string }
  reminder: { enabled: boolean, weekday: number, time: string }
  attention: { declined: number, messageProblems: number, blockedMessages: number }
}
const { data } = await useAsyncData(`overview-${route.params.slug}`, () => capi<Overview>('/overview'))

type Step = { done: boolean, now?: boolean, title: string, detail: string, action?: { label: string, to: string } }
function monthSteps(m: MonthInfo, people: number): Step[] {
  const steps: Step[] = []
  steps.push({
    done: m.services > 0,
    title: m.services ? `${m.services} ${m.services === 1 ? 'culto cadastrado' : 'cultos cadastrados'}` : 'Cadastrar os cultos',
    detail: m.services ? `O primeiro é ${m.firstServiceAt ? longDate(m.firstServiceAt, tz.value) : '—'}.` : 'Os cultos precisam existir antes de pedir as indisponibilidades.',
    action: { label: m.services ? 'Ver cultos' : 'Cadastrar cultos', to: link(`/coordenacao/cultos/${m.month}`) },
  })
  const av = m.availability
  const published = m.schedule.status === 'published'
  steps.push({
    done: av?.status === 'sent' || (published && !av),
    title: published && !av ? 'Escala feita sem pedido pelo app' : !av || av.status === 'cancelled' ? 'Pedir as indisponibilidades' : av.status === 'scheduled' ? `Pedido agendado para ${dateTime(av.sendAt, tz.value)}` : `${av.responses} de ${people} responderam`,
    detail: published && !av
      ? 'As indisponibilidades deste mês não foram coletadas pelo app.'
      : !av || av.status === 'cancelled'
          ? 'Uma mensagem leva cada pessoa ao app para marcar os cultos em que não pode servir.'
          : `Prazo: ${longDate(av.deadlineAt, tz.value)}, ${time(av.deadlineAt, tz.value)}.`,
    action: { label: av ? 'Acompanhar respostas' : 'Agendar pedido', to: link(`/coordenacao/disponibilidade/${m.month}`) },
  })
  steps.push({
    done: m.schedule.status === 'published',
    title: m.schedule.status === 'published' ? `Escala publicada (versão ${m.schedule.version})` : 'Montar e publicar a escala',
    detail: m.schedule.status === 'published' && m.schedule.publishedAt ? `Publicada em ${dateTime(m.schedule.publishedAt, tz.value)}. Alterações geram nova versão e avisos só aos afetados.` : 'O editor aponta vagas, choques, indisponibilidades e quem ficou sem domingo livre.',
    action: { label: m.schedule.status === 'published' ? 'Abrir escala' : 'Montar escala', to: link(`/coordenacao/escalas/${m.month}`) },
  })
  const firstOpen = steps.findIndex((s) => !s.done)
  if (firstOpen >= 0) steps[firstOpen]!.now = true
  return steps
}

const setup = computed<Step[]>(() => {
  const c = data.value?.counts
  if (!c) return []
  return [
    { done: c.duties > 0, title: 'Funções e instruções', detail: `${c.duties} funções ativas.`, action: { label: 'Funções', to: link('/coordenacao/funcoes') } },
    { done: c.qualifiedPeople >= 3, title: 'Pessoas e habilitações', detail: `${c.people} pessoas, ${c.qualifiedPeople} com alguma função.`, action: { label: 'Pessoas', to: link('/coordenacao/pessoas') } },
    { done: c.withConsent > 0 && c.withConsent >= c.withPhone * 0.5, title: 'Telefones e consentimento', detail: `${c.withPhone} com telefone, ${c.withConsent} autorizaram mensagens.`, action: { label: 'Registrar', to: link('/coordenacao/pessoas?filtro=sem-consentimento') } },
    { done: c.withAccount >= c.people * 0.5, title: 'Convites de acesso', detail: `${c.withAccount} de ${c.people} já criaram senha.`, action: { label: 'Convidar', to: link('/coordenacao/pessoas?filtro=sem-acesso') } },
    { done: data.value!.whatsapp.mode !== 'disabled', title: 'Canal do WhatsApp', detail: data.value!.whatsapp.mode === 'cloud_api' ? 'Canal oficial configurado.' : data.value!.whatsapp.mode === 'simulation' ? 'Em simulação: mensagens não saem do servidor.' : 'Desativado.', action: { label: 'Canal', to: link('/coordenacao/whatsapp') } },
    { done: c.templates > 0, title: 'Modelos de liturgia', detail: `${c.templates} modelos.`, action: { label: 'Modelos', to: link('/coordenacao/modelos') } },
  ]
})
const setupPending = computed(() => setup.value.filter((s) => !s.done).length)
const attentionTotal = computed(() => {
  const a = data.value?.attention
  return a ? a.declined + a.messageProblems : 0
})
</script>

<template>
  <div class="page page--wide">
    <div class="page-head">
      <p class="kicker">
        Mesa da coordenação
      </p>
      <h1>{{ info?.church.name }}</h1>
    </div>
    <template v-if="data">
      <div
        v-if="attentionTotal"
        class="notice notice--no"
        style="margin-bottom:2rem"
      >
        <h3>Pede atenção agora</h3>
        <p>
          <template v-if="data.attention.declined">
            {{ plural(data.attention.declined, 'tarefa recusada', 'tarefas recusadas') }} sem substituto.
          </template>
          <template v-if="data.attention.messageProblems">
            {{ plural(data.attention.messageProblems, 'mensagem com falha', 'mensagens com falha') }} no envio.
          </template>
        </p>
        <div class="row">
          <NuxtLink
            v-if="data.attention.declined"
            class="btn btn--small"
            :to="link('/coordenacao/pendencias')"
          >Ver pendências</NuxtLink>
          <NuxtLink
            v-if="data.attention.messageProblems"
            class="btn btn--small"
            :to="link('/coordenacao/mensagens?status=failed,unknown')"
          >Ver mensagens</NuxtLink>
        </div>
      </div>

      <div class="split">
        <div>
          <section
            v-for="m in [...data.months].reverse()"
            :key="m.month"
            class="section"
            style="margin-top:0;margin-bottom:2.5rem"
          >
            <div class="section-head">
              <h2>{{ m.monthLabel.charAt(0).toUpperCase() + m.monthLabel.slice(1) }}</h2>
              <span class="small muted">{{ m.month === currentMonth(tz) ? 'mês corrente' : 'próximo mês' }}</span>
            </div>
            <ol class="steps">
              <li
                v-for="(s, i) in monthSteps(m, data.counts.qualifiedPeople)"
                :key="i"
              >
                <span
                  class="steps__mark"
                  :class="{ 'steps__mark--done': s.done, 'steps__mark--now': s.now }"
                  :aria-label="s.done ? 'feito' : s.now ? 'próximo passo' : 'a fazer'"
                >
                  <Icon
                    v-if="s.done"
                    name="check"
                  />
                </span>
                <div class="line">
                  <span class="line__main">
                    <span class="line__title">{{ s.title }}</span>
                    <span
                      class="line__sub"
                      style="display:block"
                    >{{ s.detail }}</span>
                  </span>
                  <NuxtLink
                    v-if="s.action"
                    :to="s.action.to"
                    class="btn btn--small"
                    :class="{ 'btn--primary': s.now }"
                  >{{ s.action.label }}</NuxtLink>
                </div>
              </li>
            </ol>
          </section>
        </div>
        <aside>
          <div class="section-head">
            <h2>Lembrete semanal</h2>
          </div>
          <p style="margin-top:.6rem">
            <template v-if="data.reminder.enabled">
              Toda <strong>{{ WEEKDAYS[data.reminder.weekday] }}</strong> às <strong>{{ hhmm(data.reminder.time) }}</strong>, cada pessoa escalada recebe as tarefas dos próximos 7 dias.
            </template>
            <template v-else>
              Desligado. Ligue em configurações.
            </template>
          </p>
          <p style="margin-top:.5rem">
            <NuxtLink :to="link('/coordenacao/mensagens')">Prévia do próximo envio</NuxtLink>
          </p>

          <div
            class="section-head"
            style="margin-top:2rem"
          >
            <h2>Pessoas</h2>
          </div>
          <div class="figures">
            <div>
              <div class="figure__n">
                {{ data.counts.people }}
              </div><div class="figure__l">
                ativas
              </div>
            </div>
            <div>
              <div class="figure__n">
                {{ data.counts.withAccount }}
              </div><div class="figure__l">
                com acesso
              </div>
            </div>
            <div>
              <div class="figure__n">
                {{ data.counts.withConsent }}
              </div><div class="figure__l">
                recebem WhatsApp
              </div>
            </div>
          </div>

          <div
            class="section-head"
            style="margin-top:2rem"
          >
            <h2>Preparação</h2>
            <span
              v-if="setupPending"
              class="small muted"
            >{{ setupPending }} a completar</span>
          </div>
          <ol class="steps">
            <li
              v-for="(s, i) in setup"
              :key="i"
            >
              <span
                class="steps__mark"
                :class="{ 'steps__mark--done': s.done }"
                :aria-label="s.done ? 'feito' : 'a fazer'"
              ><Icon
                v-if="s.done"
                name="check"
              /></span>
              <div>
                <NuxtLink
                  v-if="s.action"
                  :to="s.action.to"
                  class="line__title"
                >{{ s.title }}</NuxtLink>
                <span
                  class="line__sub"
                  style="display:block"
                >{{ s.detail }}</span>
              </div>
            </li>
          </ol>
        </aside>
      </div>
    </template>
  </div>
</template>
