<script setup lang="ts">
import type { HomeResponse, Task } from '~/types'

useHead({ title: 'Início' })
const route = useRoute()
const { capi, link, tz, info, isCoordinator } = useChurch()
const { me } = useSession()
const { data, refresh, error } = await useAsyncData(`home-${route.params.slug}`, () => capi<HomeResponse>('/me/home'))
const { respond, busy } = useRespond(refresh)
interface Candidate { personId: string, displayName: string }

const declining = ref<Task | null>(null)
const declineBusy = ref(false)
async function decline(candidate?: Candidate) {
  const t = declining.value
  if (!t) return
  declineBusy.value = true
  try {
    const message = candidate ? `A coordenação foi avisada e ${candidate.displayName.split(' ')[0]} recebeu um pedido para assumir.` : undefined
    if (await respond(t, 'declined', undefined, message, candidate?.personId)) declining.value = null
  } finally {
    declineBusy.value = false
  }
}

const firstName = computed(() => (me.value?.account.displayName ?? '').replace(/^(Pr|Pra|Rev|Revda?)\.\s*/i, '').split(' ')[0] ?? '')
const next = computed(() => data.value?.tasks[0] ?? null)
const nextGroup = computed(() => (next.value ? data.value!.tasks.filter((t) => t.service.id === next.value!.service.id) : []))
const later = computed(() => {
  const rest = (data.value?.tasks ?? []).filter((t) => !nextGroup.value.includes(t))
  const byService = new Map<string, Task[]>()
  for (const t of rest) byService.set(t.service.id, [...(byService.get(t.service.id) ?? []), t])
  return [...byService.values()]
})
const arrivals = computed(() => nextGroup.value.map((t) => t.arrivalAt).filter((x): x is string => Boolean(x)).sort())
const pending = computed(() => nextGroup.value.filter((t) => t.status === 'pending').length)
const lede = computed(() => {
  if (!next.value) return 'Nada marcado por enquanto. Aproveite o descanso!'
  const when = relativeDay(next.value.service.startsAt, tz.value)
  const day = when === 'hoje' || when === 'amanhã' ? when[0]!.toUpperCase() + when.slice(1) : `${weekdayLong(next.value.service.startsAt, tz.value)[0]!.toUpperCase()}${weekdayLong(next.value.service.startsAt, tz.value).slice(1)}`
  return pending.value ? `${day} você está na escala. Confirma?` : `Tudo certo para ${when === 'hoje' || when === 'amanhã' ? when : weekdayLong(next.value.service.startsAt, tz.value)}. Obrigado!`
})
const liturgy = computed(() => (next.value ? data.value?.serviceLiturgy?.[next.value.service.id] ?? null : null))
const reminderDay = computed(() => (info.value?.church.reminderEnabled ? WEEKDAYS[info.value.church.reminderWeekday]!.replace('-feira', '') : null))
const welcome = computed(() => route.query.bemvindo === '1')
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
</script>

<template>
  <section class="stack">
    <div>
      <p class="eyebrow">
        {{ longDate(new Date(), tz) }}
      </p>
      <h1 class="h1">
        Oi, {{ firstName }}!
      </h1>
      <p
        v-if="data"
        class="lede"
      >
        {{ lede }}
      </p>
    </div>

    <div
      v-if="welcome"
      class="panel panel--ok row"
      style="align-items:flex-start;flex-wrap:nowrap;border-radius:18px"
    >
      <Icon
        name="check"
        :weight="2"
        style="width:22px;height:22px;flex:none;margin-top:2px;color:var(--ok)"
      />
      <div>
        <p
          class="strong"
          style="color:var(--ok-ink)"
        >
          Seu acesso está pronto!
        </p>
        <p
          style="color:var(--ok-text);font-size:15px;margin-top:2px"
        >
          Aqui você vê suas tarefas, confirma presença e pede trocas. Dica: salve esta página na tela inicial do celular.
        </p>
      </div>
    </div>

    <p
      v-if="error"
      class="panel panel--no"
    >
      {{ apiErrorMessage(error) }}
    </p>

    <template v-if="data">
      <NuxtLink
        v-for="a in data.availability.filter((x) => !x.responded)"
        :key="a.month"
        :to="link(`/disponibilidade/${a.month}`)"
        class="cta-card"
      >
        <span class="cta-card__icon"><Icon
          name="calendar"
          :weight="1.9"
        /></span>
        <span class="grow"><span class="cta-card__title">Em quais cultos de {{ monthName(a.month) }} você não pode?</span><span class="cta-card__sub">Leva 1 minuto · responda até {{ weekdayLong(a.deadlineAt, tz).replace('-feira', '') }}, {{ dayMonth(a.deadlineAt, tz) }}</span></span>
        <Icon
          name="chevron-right"
          :weight="2"
          class="cta-card__chev"
        />
      </NuxtLink>
      <NuxtLink
        v-if="data.swapsWaiting"
        :to="link('/trocas')"
        class="cta-card"
      >
        <span class="cta-card__icon"><Icon
          name="swap"
          :weight="1.9"
        /></span>
        <span class="grow"><span class="cta-card__title">{{ data.swapsWaiting === 1 ? 'Alguém pediu que você assuma uma tarefa' : `${data.swapsWaiting} pedidos para você assumir tarefas` }}</span><span class="cta-card__sub">A troca só vale se você aceitar</span></span>
        <Icon
          name="chevron-right"
          :weight="2"
          class="cta-card__chev"
        />
      </NuxtLink>

      <section v-if="next">
        <p class="section-label">
          Sua próxima escala · {{ relativeDay(next.service.startsAt, tz) }}
        </p>
        <article class="card card--lg card--flush card--rel">
          <svg
            viewBox="0 0 120 120"
            aria-hidden="true"
            class="rings"
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
            style="flex-wrap:nowrap;gap:16px;padding:20px 20px 16px;border-bottom:1px solid var(--line-2);position:relative"
          >
            <DateTile
              :date="next.service.startsAt"
              :tz="tz"
              accent
              large
              month
            />
            <div class="grow">
              <h2 style="font-size:20px;line-height:1.2">
                {{ cap(longDate(next.service.startsAt, tz)) }}
              </h2>
              <p
                class="soft"
                style="margin-top:3px;font-size:15px"
              >
                {{ next.service.title }} · {{ time(next.service.startsAt, tz) }}<template v-if="next.service.location">
                  · {{ next.service.location }}
                </template>
              </p>
              <p
                v-if="liturgy?.season || liturgy?.color"
                class="lit"
                style="margin-top:6px"
              >
                <span
                  class="dot"
                  :style="{ background: liturgicalHex(liturgy.color) ?? 'var(--muted)' }"
                />{{ [liturgy.season, liturgy.color].filter(Boolean).join(' · ') }}
              </p>
            </div>
          </div>
          <div
            v-if="arrivals[0]"
            class="row"
            style="padding:12px 20px;background:var(--surface-2);border-bottom:1px solid var(--line-2);font-size:15px"
          >
            <Icon
              name="clock"
              :weight="1.9"
              style="width:20px;height:20px;color:var(--ink-3)"
            />
            <span>Chegue às <strong style="font-size:17px">{{ time(arrivals[0], tz) }}</strong></span>
          </div>
          <div
            v-for="t in nextGroup"
            :key="t.assignmentId"
            style="padding:18px 20px;border-bottom:1px solid var(--line-2)"
          >
            <div class="row">
              <h3
                class="grow"
                style="font-size:19px;min-width:120px"
              >
                {{ t.duty.name }}
              </h3>
              <span
                class="status"
                :class="`status--${t.status}`"
              >{{ t.status === 'confirmed' ? 'Confirmado' : t.status === 'declined' ? 'Você avisou que não pode' : 'Aguardando sua confirmação' }}</span>
            </div>
            <p
              v-if="t.arrivalAt && nextGroup.length > 1"
              class="soft small"
              style="margin-top:4px"
            >
              Chegada para esta tarefa: {{ time(t.arrivalAt, tz) }}
            </p>
            <p
              v-if="t.duty.instructions"
              style="margin-top:8px;color:var(--ink-2);font-size:15px"
            >
              {{ t.duty.instructions }}
            </p>
            <p
              v-if="t.openSwaps.length"
              class="small soft"
              style="margin-top:8px"
            >
              Pedido de troca enviado para {{ t.openSwaps.map((s) => s.candidateName).join(', ') }}.
            </p>
            <div
              v-if="t.status === 'pending'"
              style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px"
            >
              <button
                type="button"
                class="btn btn--ok"
                style="min-height:48px"
                :disabled="busy === t.assignmentId"
                @click="respond(t, 'confirmed')"
              >
                <Icon
                  name="check"
                  :weight="2.2"
                />Confirmar
              </button>
              <button
                type="button"
                class="btn btn--secondary"
                style="min-height:48px"
                :disabled="busy === t.assignmentId"
                @click="declining = t"
              >
                Não posso
              </button>
            </div>
            <div
              v-else-if="t.status === 'confirmed'"
              class="row"
              style="margin-top:12px;gap:8px"
            >
              <p
                class="soft grow"
                style="font-size:14.5px;min-width:160px"
              >
                {{ reminderDay ? `Combinado! Lembramos você na ${reminderDay}.` : 'Combinado! Obrigado por servir.' }}
              </p>
              <button
                type="button"
                class="link"
                style="padding:8px 4px;font-size:14.5px"
                @click="declining = t"
              >
                Imprevisto? Avisar
              </button>
            </div>
            <div
              v-else
              class="row"
              style="margin-top:12px;gap:8px"
            >
              <p
                class="soft grow"
                style="font-size:14.5px;min-width:160px"
              >
                Tudo bem. A coordenação já sabe.
              </p>
              <button
                type="button"
                class="link"
                style="padding:8px 4px;font-size:14.5px"
                :disabled="busy === t.assignmentId"
                @click="respond(t, 'confirmed')"
              >
                Mudei de ideia, posso sim
              </button>
            </div>
          </div>
          <NuxtLink
            :to="link(`/roteiros/${next.service.id}`)"
            class="row"
            style="flex-wrap:nowrap;padding:14px 20px;font-weight:700;font-size:15px;color:var(--accent-deep);text-decoration:none"
          >
            <Icon
              name="book"
              :weight="1.9"
              style="width:20px;height:20px"
            /><span class="grow">Ver o roteiro deste culto</span><Icon
              name="chevron-right"
              :weight="2"
              style="width:18px;height:18px"
            />
          </NuxtLink>
        </article>
      </section>
      <div
        v-else
        class="card--dashed"
      >
        <p
          class="strong"
          style="font-size:18px"
        >
          Nenhuma escala com seu nome por enquanto
        </p>
        <p
          class="soft"
          style="margin:6px auto 0;max-width:380px"
        >
          Quando a coordenação publicar uma escala, ela aparece aqui e você recebe um lembrete.
        </p>
        <NuxtLink
          :to="link('/escala')"
          class="btn btn--secondary btn--md"
          style="margin-top:16px;min-height:44px"
        >
          Ver a escala da igreja
        </NuxtLink>
      </div>

      <section v-if="later.length || !data.nextMonth.published">
        <p class="section-label">
          Depois
        </p>
        <div class="stack-sm">
          <NuxtLink
            v-for="group in later"
            :key="group[0]!.service.id"
            :to="link(`/tarefas/${group[0]!.assignmentId}`)"
            class="card row"
            style="flex-wrap:nowrap;gap:14px;text-decoration:none;color:inherit"
          >
            <DateTile
              :date="group[0]!.service.startsAt"
              :tz="tz"
            />
            <span class="grow"><span
              class="strong"
              style="display:block"
            >{{ group.map((t) => t.duty.name).join(' · ') }}</span><span
              class="soft small"
              style="display:block"
            >{{ group[0]!.service.title }} · {{ time(group[0]!.service.startsAt, tz) }}</span></span>
            <span
              class="status"
              :class="`status--${group.some((t) => t.status === 'pending') ? 'pending' : group.every((t) => t.status === 'declined') ? 'declined' : 'confirmed'}`"
            >{{ group.some((t) => t.status === 'pending') ? 'A confirmar' : group.every((t) => t.status === 'declined') ? 'Não pode' : 'Confirmado' }}</span>
          </NuxtLink>
          <div
            v-if="!data.nextMonth.published"
            class="card row"
            style="flex-wrap:nowrap;gap:14px;border-radius:20px"
          >
            <span
              class="cta-card__icon"
              style="background:var(--surface-4);color:var(--muted)"
            ><Icon
              name="sparkle"
              :weight="1.9"
            /></span>
            <div>
              <p style="font-weight:700">
                {{ cap(monthName(data.nextMonth.month)) }} ainda está sendo montado
              </p>
              <p
                class="soft"
                style="font-size:14.5px;margin-top:2px"
              >
                Aparece aqui quando publicar.
              </p>
            </div>
          </div>
        </div>
      </section>

      <NuxtLink
        v-if="isCoordinator"
        :to="link('/coordenacao')"
        class="cta-card cta-card--dark"
      >
        <span class="grow"><span class="cta-card__title">Ir para a coordenação</span><span class="cta-card__sub">Preparar {{ monthName(data.nextMonth.month) }}, pessoas e configurações</span></span>
        <Icon
          name="chevron-right"
          :weight="2"
          class="cta-card__chev"
        />
      </NuxtLink>
    </template>

    <DeclineSheet
      :task="declining"
      :busy="Boolean(busy) || declineBusy"
      @close="declining = null"
      @decline="decline"
    />
  </section>
</template>
