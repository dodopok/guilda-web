<script setup lang="ts">
interface AvailabilityService {
  id: string
  title: string
  startsAt: string
  localDate: string
  time: string
  location: string | null
  kind: string
  unavailable: boolean
  isNew: boolean
  liturgy: { color: string | null, season: string | null }
}
interface Availability {
  month: string
  monthLabel: string
  request: { status: string, sendAt: string, deadlineAt: string, sentAt: string | null } | null
  response: { submittedAt: string, updatedAt: string, source: string, note: string | null } | null
  services: AvailabilityService[]
}

const props = withDefaults(defineProps<{ month: string, embedded?: boolean }>(), { embedded: false })
const emit = defineEmits<{ submitted: [] }>()
const route = useRoute()
const { capi, tz } = useChurch()
const toast = useToast()
const { data } = await useAsyncData(() => `avail-picker-${route.params.slug}-${props.month}`, () => capi<Availability>(`/me/availability/${props.month}`), { watch: [() => props.month] })

const unavailable = ref<Set<string>>(new Set())
const note = ref('')
const noteOpen = ref(false)
watch(() => data.value, (value) => {
  unavailable.value = new Set((value?.services ?? []).filter((service) => service.unavailable).map((service) => service.id))
  note.value = value?.response?.note ?? ''
  noteOpen.value = Boolean(note.value)
}, { immediate: true })

function toggle(serviceId: string) {
  const next = new Set(unavailable.value)
  if (next.has(serviceId)) next.delete(serviceId)
  else next.add(serviceId)
  unavailable.value = next
}

const saving = ref(false)
const availableCount = computed(() => Math.max(0, (data.value?.services.length ?? 0) - unavailable.value.size))
const buttonLabel = computed(() => unavailable.value.size
  ? `Enviar · não posso em ${unavailable.value.size} de ${data.value?.services.length ?? 0}`
  : `Enviar · posso em ${availableCount.value} de ${data.value?.services.length ?? 0}`)
const deadlineLabel = computed(() => data.value?.request
  ? `${weekdayLong(data.value.request.deadlineAt, tz.value).replace('-feira', '')}, ${dayMonth(data.value.request.deadlineAt, tz.value)}`
  : null)

async function save() {
  if (!data.value?.services.length) return
  saving.value = true
  try {
    const result = await capi<{ conflictsWithSchedule: number }>(`/me/availability/${props.month}`, {
      method: 'PUT',
      body: { unavailableServiceIds: [...unavailable.value], note: note.value || null },
    })
    toast.ok(unavailable.value.size
      ? `Resposta enviada: você não pode em ${plural(unavailable.value.size, 'culto', 'cultos')}.`
      : 'Resposta enviada: você pode em todos. Obrigado!')
    if (result.conflictsWithSchedule) toast.ok('Você já estava na escala em um desses cultos. A coordenação foi avisada.')
    emit('submitted')
  } catch (error) {
    toast.error(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section
    class="availability-picker stack-md"
    :class="{ 'availability-picker--embedded': embedded }"
  >
    <div class="availability-header">
      <div class="grow">
        <h1
          v-if="!embedded"
          class="h1--sm"
        >
          {{ monthName(month) }}: em quais cultos você não pode?
        </h1>
        <h2
          v-else
          class="h3"
        >
          {{ monthName(month) }}: em quais dias você não pode?
        </h2>
        <p
          class="soft"
          style="margin-top:6px"
        >
          Toque só nos dias que não dá. Nada marcado = pode em todos.<template v-if="deadlineLabel">
            Responda até {{ deadlineLabel }}.
          </template>
        </p>
        <p
          v-if="data?.response"
          class="small muted"
          style="margin-top:4px"
        >
          Você respondeu em {{ dateTime(data.response.updatedAt, tz) }}. Pode mudar quando quiser.
        </p>
      </div>
      <div
        v-if="!embedded && data?.services.length"
        class="availability-actions availability-actions--desktop"
      >
        <button
          type="button"
          class="btn btn--block"
          :disabled="saving"
          @click="save"
        >
          {{ saving ? 'Enviando…' : buttonLabel }}
        </button>
      </div>
    </div>

    <div
      v-if="data && !data.services.length"
      class="card--dashed"
    >
      <p class="strong">
        Ainda não há cultos cadastrados em {{ monthName(month) }}.
      </p>
    </div>

    <div
      v-if="data?.services.length"
      class="availability-list"
      role="group"
      :aria-label="`Cultos de ${monthName(month)}`"
    >
      <button
        v-for="service in data.services"
        :key="service.id"
        type="button"
        class="availability-row"
        :class="{ 'availability-row--no': unavailable.has(service.id) }"
        :aria-pressed="unavailable.has(service.id)"
        @click="toggle(service.id)"
      >
        <DateTile
          :date="service.startsAt"
          :tz="tz"
          :accent="unavailable.has(service.id)"
        />
        <span class="availability-row__copy">
          <span class="availability-row__title">{{ service.title }} <span
            v-if="service.isNew"
            class="tag tag--info"
          >novo</span></span>
          <span class="availability-row__sub">
            {{ hhmm(service.time) }}<template v-if="service.liturgy.season"> · {{ service.liturgy.season }}</template><template v-if="service.location"> · {{ service.location }}</template>
          </span>
        </span>
        <span
          class="availability-row__state"
          :class="unavailable.has(service.id) ? 'availability-row__state--no' : 'availability-row__state--yes'"
        >{{ unavailable.has(service.id) ? 'Não posso' : 'Posso' }}</span>
      </button>
    </div>

    <div v-if="data?.services.length">
      <button
        type="button"
        class="link link--muted availability-note-toggle"
        :aria-expanded="noteOpen"
        @click="noteOpen = !noteOpen"
      >
        <Icon
          :name="noteOpen ? 'minus' : 'plus'"
          :weight="2"
        />
        {{ noteOpen ? 'Esconder recado' : 'Deixar um recado para a coordenação' }}
      </button>
      <label
        v-if="noteOpen"
        class="field"
        style="margin-top:8px"
      >
        <span class="sr-only">Recado para a coordenação</span>
        <textarea
          v-model="note"
          class="textarea"
          maxlength="500"
          rows="2"
          placeholder="Ex.: no dia 18 só consigo chegar às 10h"
        />
      </label>
    </div>

    <div
      v-if="data?.services.length"
      class="availability-actions availability-actions--bottom"
    >
      <button
        type="button"
        class="btn btn--block"
        :disabled="saving"
        @click="save"
      >
        {{ saving ? 'Enviando…' : buttonLabel }}
      </button>
    </div>
  </section>
</template>
