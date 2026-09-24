<script setup lang="ts">
import type { HomeResponse, Task } from '~/types'

useHead({ title: 'Mesa da coordenação' })
const route = useRoute()
const { capi, tz, link, prepMonth, info } = useChurch()
const { me } = useSession()

interface MonthInfo {
  month: string
  monthLabel: string
  services: number
  firstServiceAt: string | null
  nextServiceAt: string | null
  slots: { required: number, filled: number }
  scheduledPeople: number
  pendingConfirmations: number
  schedule: { status: string, version: number, publishedAt: string | null }
  availability: { status: string, sendAt: string, deadlineAt: string, responses: number } | null
}
interface Overview {
  counts: { duties: number, people: number, withAccount: number, withConsent: number }
  months: MonthInfo[]
  whatsapp: { mode: string }
  attention: { declined: number, messageProblems: number }
}
interface Declined { assignmentId: string, personName: string, dutyName: string, serviceId: string, startsAt: string }
const { data, refresh } = await useAsyncData(`desk-${route.params.slug}`, async () => {
  const [overview, pending, member] = await Promise.all([
    capi<Overview>('/overview'),
    capi<{ declined: Declined[] }>('/pending'),
    capi<HomeResponse>('/me/home'),
  ])
  return { overview, declined: pending.declined, member }
})
const firstName = computed(() => (me.value?.account.displayName ?? '').replace(/^(Pr|Pra|Rev|Revda?)\.\s*/i, '').split(' ')[0] ?? '')
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const prep = computed(() => data.value?.overview.months.find((m) => m.month === prepMonth.value) ?? data.value?.overview.months[1] ?? null)
const current = computed(() => data.value?.overview.months.find((m) => m.month !== prep.value?.month) ?? null)

type StepState = 'done' | 'now' | 'progress' | 'todo'
const journey = computed(() => {
  const m = prep.value
  if (!m) return []
  const published = m.schedule.status === 'published'
  const req = m.availability
  const s1: StepState = m.services ? 'done' : 'now'
  const skipped = !req && m.slots.filled > 0
  const s2: StepState = !m.services ? 'todo' : published || skipped ? 'done' : req?.status === 'sent' ? 'progress' : 'now'
  const s3: StepState = published ? 'done' : s2 === 'progress' || s2 === 'done' ? 'now' : 'todo'
  const s4: StepState = published ? 'done' : 'todo'
  const people = data.value!.overview.counts.people
  return [
    { n: 1, state: s1, title: m.services ? plural(m.services, 'culto marcado', 'cultos marcados') : 'Marcar os cultos do mês', sub: m.firstServiceAt ? `O primeiro é ${weekdayLong(m.firstServiceAt, tz.value).replace('-feira', '')}, ${dayMonth(m.firstServiceAt, tz.value)}` : 'Já sugerimos os domingos; você ajusta' },
    {
      n: 2,
      state: s2,
      title: skipped ? 'Escala feita sem perguntar pelo app' : !req || req.status === 'cancelled' ? 'Perguntar quem não pode' : req.status === 'scheduled' ? `Pedido agendado para ${weekdayLong(req.sendAt, tz.value).replace('-feira', '')}, ${shortDate(req.sendAt, tz.value)}` : `${req.responses} de ${people} já responderam`,
      sub: req?.status === 'sent' ? `Prazo: ${weekdayLong(req.deadlineAt, tz.value).replace('-feira', '')}, ${dayMonth(req.deadlineAt, tz.value)}, ${time(req.deadlineAt, tz.value)}` : 'Cada pessoa marca no app os cultos em que não pode',
    },
    { n: 3, state: s3, title: published ? 'Escala montada' : m.slots.filled ? `Escala em andamento: ${m.slots.filled} de ${m.slots.required} vagas` : 'Montar a escala', sub: published ? 'Todas as vagas revisadas' : 'A gente sugere quem escalar; você só confirma' },
    { n: 4, state: s4, title: published ? `Publicada · versão ${m.schedule.version}` : 'Publicar e avisar', sub: published ? 'Todo mundo já pode ver no app' : 'Cada pessoa recebe suas tarefas pelo WhatsApp' },
  ]
})
const nowStep = computed(() => journey.value.find((j) => j.state === 'now')?.n ?? (prep.value?.schedule.status === 'published' ? 4 : 3))
const published = computed(() => prep.value?.schedule.status === 'published')
const ctaLabel = computed(() => (published.value ? 'Ver ou mudar a escala' : nowStep.value === 1 ? 'Continuar: marcar os cultos' : nowStep.value === 2 ? 'Continuar: perguntar quem não pode' : nowStep.value === 3 ? 'Continuar: montar a escala' : 'Continuar: publicar'))
const ctaTo = computed(() => (published.value ? link(`/escala/${prep.value!.month}`) : link(`/coordenacao/preparar/${prep.value!.month}?passo=${nowStep.value}`)))
const substituteLink = (d: Declined) => link(`/coordenacao/preparar/${localDateKey(d.startsAt, tz.value).slice(0, 7)}?passo=3&culto=${d.serviceId}`)
const waMode = computed(() => info.value?.whatsappMode ?? data.value?.overview.whatsapp.mode)
const ownTask = computed(() => data.value?.member.tasks[0] ?? null)
const ownAvailability = computed(() => data.value?.member.availability.find((x) => !x.responded) ?? null)
const { respond, busy: responseBusy } = useRespond(refresh)
const myDeclining = ref<Task | null>(null)
const declineBusy = ref(false)
async function declineOwnTask(candidate?: { personId: string, displayName: string }) {
  const task = myDeclining.value
  if (!task) return
  declineBusy.value = true
  try {
    const note = candidate ? `A coordenação foi avisada e ${candidate.displayName.split(' ')[0]} recebeu um pedido para assumir.` : undefined
    if (await respond(task, 'declined', undefined, note, candidate?.personId)) myDeclining.value = null
  } finally {
    declineBusy.value = false
  }
}
</script>

<template>
  <section
    v-if="data"
    class="stack-lg"
  >
    <div>
      <p class="eyebrow">
        Coordenação · {{ longDate(new Date(), tz) }}
      </p>
      <h1 class="h1">
        Oi, {{ firstName }}!
      </h1>
    </div>

    <div
      v-if="data.declined.length || data.overview.attention.messageProblems || current?.pendingConfirmations"
      class="panel panel--no"
    >
      <p
        class="strong row"
        style="gap:8px;color:var(--no-ink);margin-bottom:8px"
      >
        <Icon
          name="alert"
          :weight="2"
          style="width:20px;height:20px"
        />{{ data.declined.length + data.overview.attention.messageProblems + (current?.pendingConfirmations ?? 0) }} coisas precisam de você.
      </p>
      <div
        v-for="d in data.declined"
        :key="d.assignmentId"
        class="row"
        style="padding:6px 0"
      >
        <p
          class="grow"
          style="min-width:200px;color:#5a2a22"
        >
          <strong>{{ d.personName }}</strong> avisou que não pode: {{ d.dutyName }}, {{ longDate(d.startsAt, tz) }}.
        </p>
        <NuxtLink
          :to="substituteLink(d)"
          class="btn btn--white btn--sm"
          style="color:var(--no-ink)"
        >
          Escolher substituto
        </NuxtLink>
      </div>
      <div
        v-if="data.overview.attention.messageProblems"
        class="row"
        style="padding:6px 0"
      >
        <p
          class="grow"
          style="min-width:200px;color:#5a2a22"
        >
          {{ plural(data.overview.attention.messageProblems, 'mensagem não saiu', 'mensagens não saíram') }} (falha ou envio incerto).
        </p>
        <NuxtLink
          :to="link('/coordenacao/mensagens?status=failed,unknown')"
          class="btn btn--white btn--sm"
          style="color:var(--no-ink)"
        >
          Ver mensagens
        </NuxtLink>
      </div>
      <div
        v-if="current?.pendingConfirmations"
        class="row"
        style="padding:6px 0"
      >
        <p
          class="grow"
          style="min-width:200px;color:#5a2a22"
        >
          {{ current.pendingConfirmations }} ainda não {{ current.pendingConfirmations === 1 ? 'confirmou' : 'confirmaram' }} a próxima escala.
        </p>
        <NuxtLink
          :to="link(`/escala/${current.month}`)"
          class="btn btn--white btn--sm"
          style="color:var(--no-ink)"
        >
          Ver escala
        </NuxtLink>
      </div>
    </div>

    <div
      class="coord-home-grid"
      :class="{ 'coord-home-grid--without-own-content': !ownTask && !ownAvailability }"
    >
      <div class="coord-home-left stack-lg">
        <article
          v-if="ownTask"
          class="card card--flush coord-own-task"
        >
          <div
            class="row coord-own-task__head"
            style="flex-wrap:nowrap;gap:14px;padding:16px 18px;border-bottom:1px solid var(--line-2)"
          >
            <DateTile
              :date="ownTask.service.startsAt"
              :tz="tz"
              accent
            />
            <div class="grow">
              <p class="caps">
                Você também serve
              </p>
              <h2 style="font-size:19px;margin-top:2px">
                {{ ownTask.duty.name }}
              </h2>
              <p
                class="soft small"
                style="margin-top:2px"
              >
                {{ cap(longDate(ownTask.service.startsAt, tz)) }} · {{ ownTask.service.title }} · chegue às {{ ownTask.arrivalAt ? time(ownTask.arrivalAt, tz) : time(ownTask.service.startsAt, tz) }}
              </p>
            </div>
            <span
              class="status"
              :class="`status--${ownTask.status}`"
            >{{ ownTask.status === 'pending' ? 'A confirmar' : ownTask.status === 'confirmed' ? 'Confirmado' : 'Não pode' }}</span>
          </div>
          <p
            v-if="ownTask.duty.instructions"
            class="soft"
            style="padding:12px 18px 0"
          >
            {{ ownTask.duty.instructions }}
          </p>
          <div
            class="row coord-own-task__actions"
            style="padding:12px 18px 16px;gap:8px"
          >
            <button
              v-if="ownTask.status === 'pending'"
              type="button"
              class="btn btn--ok btn--sm"
              :disabled="responseBusy === ownTask.assignmentId"
              @click="respond(ownTask, 'confirmed')"
            >
              Confirmar
            </button>
            <button
              v-if="ownTask.status === 'pending'"
              type="button"
              class="btn btn--secondary btn--sm"
              :disabled="responseBusy === ownTask.assignmentId"
              @click="myDeclining = ownTask"
            >
              Não posso
            </button>
            <NuxtLink
              :to="link(`/tarefas/${ownTask.assignmentId}`)"
              class="link"
            >Ver tarefa</NuxtLink>
            <NuxtLink
              :to="link(`/roteiros/${ownTask.service.id}`)"
              class="link link--muted"
            >Ver roteiro</NuxtLink>
          </div>
        </article>

        <AvailabilityPicker
          v-if="ownAvailability"
          :month="ownAvailability.month"
          embedded
          @submitted="refresh"
        />
      </div>
      <aside class="coord-home-right stack-lg">
        <article
          v-if="prep"
          class="card card--lg card--rel"
        >
          <svg
            viewBox="0 0 120 120"
            aria-hidden="true"
            class="rings"
            style="right:-28px;top:-34px;opacity:.5"
          ><circle
            cx="60"
            cy="40"
            r="26"
            fill="none"
            stroke="var(--accent-mid)"
            stroke-width="3"
          /><circle
            cx="42"
            cy="72"
            r="26"
            fill="none"
            stroke="var(--accent-mid)"
            stroke-width="3"
          /><circle
            cx="78"
            cy="72"
            r="26"
            fill="none"
            stroke="var(--accent-mid)"
            stroke-width="3"
          /></svg>
          <div
            class="row"
            style="position:relative"
          >
            <h2
              class="grow"
              style="font-size:22px"
            >
              {{ cap(monthName(prep.month)) }}
            </h2>
            <span class="tag tag--accent tag--lg">{{ published ? 'publicada' : `passo ${nowStep} de 4` }}</span>
          </div>
          <div class="coord-month-metrics">
            <NuxtLink
              :to="link(`/coordenacao/preparar/${prep.month}?passo=2`)"
              class="coord-month-metric"
            >
              <span>Responderam</span>
              <strong>{{ prep.availability?.responses ?? 0 }} / {{ data.overview.counts.people }}</strong>
              <small>{{ prep.availability ? `prazo ${weekdayLong(prep.availability.deadlineAt, tz).replace('-feira', '')} ${dayNumber(prep.availability.deadlineAt, tz)}` : 'Pergunte quem não pode' }}</small>
            </NuxtLink>
            <NuxtLink
              :to="link(`/coordenacao/preparar/${prep.month}?passo=3`)"
              class="coord-month-metric"
            >
              <span>Vagas preenchidas</span>
              <strong>{{ prep.slots.filled }} / {{ prep.slots.required }}</strong>
              <small>{{ Math.max(0, prep.slots.required - prep.slots.filled) }} ainda abertas · sugestões no Montar</small>
            </NuxtLink>
          </div>
          <NuxtLink
            :to="ctaTo"
            class="btn btn--block"
            style="margin-top:14px"
          >
            {{ ctaLabel }}<Icon
              name="arrow-right"
              :weight="2.2"
            />
          </NuxtLink>
        </article>

        <div class="grid-auto">
          <NuxtLink
            v-if="current"
            :to="current.schedule.status === 'published' ? link(`/escala/${current.month}`) : link(`/coordenacao/preparar/${current.month}`)"
            class="card"
            style="text-decoration:none;color:inherit"
          >
            <p
              class="row"
              style="gap:6px;font-size:13px;font-weight:800"
              :style="{ color: current.schedule.status === 'published' ? 'var(--ok)' : 'var(--wait)' }"
            >
              <Icon
                v-if="current.schedule.status === 'published'"
                name="check"
                :weight="2.2"
                style="width:16px;height:16px"
              />{{ cap(monthName(current.month)) }} {{ current.schedule.status === 'published' ? 'publicado' : 'em rascunho' }}
            </p>
            <p style="margin-top:6px;font-weight:800;font-size:17px">
              {{ current.nextServiceAt ? `Falta ${weekdayLong(current.nextServiceAt, tz).replace('-feira', '')} ${dayNumber(current.nextServiceAt, tz)}` : 'Todos os cultos do mês já passaram' }}
            </p>
            <p
              class="soft small"
              style="margin-top:2px"
            >
              {{ plural(current.scheduledPeople, 'pessoa escalada', 'pessoas escaladas') }} · {{ current.pendingConfirmations ? `${current.pendingConfirmations} ainda não ${current.pendingConfirmations === 1 ? 'confirmou' : 'confirmaram'}` : 'todos confirmaram' }}
            </p>
          </NuxtLink>
          <NuxtLink
            :to="link('/coordenacao/pessoas')"
            class="card"
            style="text-decoration:none;color:inherit"
          >
            <p
              class="muted"
              style="font-size:13px;font-weight:800"
            >
              Pessoas e funções
            </p>
            <p style="margin-top:6px;font-weight:800;font-size:17px">
              {{ plural(data.overview.counts.people, 'pessoa', 'pessoas') }} · {{ plural(data.overview.counts.duties, 'função', 'funções') }}
            </p>
            <p
              class="soft small"
              style="margin-top:2px"
            >
              {{ data.overview.counts.people - data.overview.counts.withAccount ? `${data.overview.counts.people - data.overview.counts.withAccount} ainda sem acesso ao app` : 'Todos já têm acesso ao app' }}
            </p>
          </NuxtLink>
        </div>

        <div
          v-if="waMode === 'simulation' || waMode === 'disabled'"
          class="panel panel--wait row"
          style="gap:12px;border-radius:18px;padding:14px 18px"
        >
          <Icon
            name="info"
            :weight="2"
            style="width:22px;height:22px;flex:none;color:var(--wait)"
          />
          <p
            class="grow"
            style="min-width:220px;font-size:15px"
          >
            <strong>{{ waMode === 'simulation' ? 'WhatsApp em modo de teste' : 'WhatsApp desligado' }}</strong> — nada sai de verdade ainda.
          </p>
          <NuxtLink
            :to="link('/coordenacao/whatsapp')"
            class="btn btn--white btn--sm"
            style="color:var(--wait-ink)"
          >
            Ligar
          </NuxtLink>
        </div>
      </aside>
    </div>

    <DeclineSheet
      :task="myDeclining"
      :busy="Boolean(responseBusy) || declineBusy"
      @close="myDeclining = null"
      @decline="declineOwnTask"
    />
  </section>
</template>
