<script setup lang="ts">
useHead({ title: 'Indisponibilidade' })
const route = useRoute()
const month = computed(() => String(route.params.month))
const { capi, tz, link } = useChurch()
const toast = useToast()

interface AvailService { id: string, title: string, startsAt: string, localDate: string, time: string, location: string | null, kind: string, unavailable: boolean, isNew: boolean }
interface Availability {
  month: string
  monthLabel: string
  request: { status: string, sendAt: string, deadlineAt: string, sentAt: string | null } | null
  response: { submittedAt: string, updatedAt: string, source: string, note: string | null } | null
  services: AvailService[]
}
const { data, refresh } = await useAsyncData(() => `avail-${route.params.slug}-${month.value}`, () => capi<Availability>(`/me/availability/${month.value}`), { watch: [month] })
const marked = ref<Set<string>>(new Set())
const note = ref('')
watchEffect(() => {
  marked.value = new Set((data.value?.services ?? []).filter((s) => s.unavailable).map((s) => s.id))
  note.value = data.value?.response?.note ?? ''
})
function setUnavailable(id: string, value: boolean) {
  const next = new Set(marked.value)
  if (value) next.add(id)
  else next.delete(id)
  marked.value = next
}
const saving = ref(false)
const afterDeadline = computed(() => (data.value?.request ? new Date(data.value.request.deadlineAt) < new Date() : false))
async function save() {
  saving.value = true
  try {
    const res = await capi<{ conflictsWithSchedule: number }>(`/me/availability/${month.value}`, { method: 'PUT', body: { unavailableServiceIds: [...marked.value], note: note.value || null } })
    toast.ok(marked.value.size ? `Resposta enviada: você não pode em ${marked.value.size} ${marked.value.size === 1 ? 'culto' : 'cultos'}.` : 'Resposta enviada: você pode em todos os cultos.')
    if (res.conflictsWithSchedule) toast.ok('Você já estava escalado(a) em um desses cultos. A coordenação foi avisada e vai ajustar.')
    await refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <p class="kicker">
        Indisponibilidade
      </p>
      <h1>Cultos de {{ monthName(month) }}</h1>
      <p
        v-if="data?.request"
        class="lede"
      >
        Para cada culto, diga se pode ou não servir. Tudo começa como “Posso”.
        <template v-if="!afterDeadline">
          Responda até {{ longDate(data.request.deadlineAt, tz) }}, às {{ time(data.request.deadlineAt, tz) }}.
        </template>
      </p>
    </div>

    <EmptyState
      v-if="!data?.request"
      title="A coleta deste mês ainda não foi aberta"
      text="Quando a coordenação pedir as indisponibilidades, você recebe uma mensagem com o link para esta página."
    >
      <NuxtLink
        class="btn"
        :to="link('')"
      >Voltar ao início</NuxtLink>
    </EmptyState>

    <template v-else>
      <div
        v-if="data.response"
        class="notice notice--ok"
        style="margin-bottom:1.25rem"
      >
        <p>Resposta registrada em {{ dateTime(data.response.updatedAt, tz) }}{{ data.response.source === 'coordination' ? ' pela coordenação' : '' }}. Você pode corrigir quando quiser.</p>
      </div>
      <div
        v-if="afterDeadline"
        class="notice notice--wait"
        style="margin-bottom:1.25rem"
      >
        <p>O prazo terminou. Você ainda pode avisar; a coordenação recebe um alerta se a escala já estiver pronta.</p>
      </div>
      <form @submit.prevent="save">
        <fieldset>
          <legend class="sr-only">
            Cultos em que não posso servir
          </legend>
          <ul class="agenda">
            <li
              v-for="s in data.services"
              :key="s.id"
            >
              <DateBlock
                :at="s.startsAt"
                :tz="tz"
              />
              <div>
                <p
                  :id="`svc-${s.id}`"
                  style="font-weight:700;font-size:1.08rem"
                >
                  <span class="sr-only">{{ longDate(s.startsAt, tz) }}, </span>{{ s.title }} · {{ time(s.startsAt, tz) }}
                  <span
                    v-if="s.kind !== 'regular'"
                    class="tag tag--plain"
                  >{{ s.kind === 'special' ? 'especial' : 'curto' }}</span>
                  <span
                    v-if="s.isNew"
                    class="tag tag--info"
                  >novo</span>
                </p>
                <div
                  class="seg"
                  role="radiogroup"
                  :aria-labelledby="`svc-${s.id}`"
                  style="margin-top:.5rem"
                >
                  <label class="seg--yes"><input
                    type="radio"
                    :name="`av-${s.id}`"
                    :checked="!marked.has(s.id)"
                    @change="setUnavailable(s.id, false)"
                  ><Icon name="check" /> Posso</label>
                  <label class="seg--no"><input
                    type="radio"
                    :name="`av-${s.id}`"
                    :checked="marked.has(s.id)"
                    @change="setUnavailable(s.id, true)"
                  ><Icon name="x" /> Não posso</label>
                </div>
              </div>
            </li>
          </ul>
        </fieldset>
        <div
          class="field"
          style="margin-top:1.5rem"
        >
          <label
            class="field__label"
            for="av-note"
          >Algo que a coordenação deve saber?</label>
          <input
            id="av-note"
            v-model="note"
            class="input"
            maxlength="500"
            placeholder="Opcional — ex.: só posso a partir das 10h"
          >
        </div>
        <div
          class="row"
          style="margin-top:1.5rem"
        >
          <button
            class="btn btn--primary"
            :disabled="saving"
          >
            {{ marked.size ? `Enviar: não posso em ${marked.size}` : 'Enviar: posso em todos' }}
          </button>
        </div>
      </form>
    </template>
  </div>
</template>
