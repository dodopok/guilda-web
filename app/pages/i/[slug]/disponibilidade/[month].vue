<script setup lang="ts">
useHead({ title: 'Disponibilidade' })
const route = useRoute()
const month = computed(() => String(route.params.month))
const { capi, tz, link } = useChurch()
const toast = useToast()

interface AvailService { id: string, title: string, startsAt: string, localDate: string, time: string, location: string | null, kind: string, unavailable: boolean, isNew: boolean, liturgy: { color: string | null, season: string | null } }
interface Availability {
  month: string
  monthLabel: string
  request: { status: string, sendAt: string, deadlineAt: string, sentAt: string | null } | null
  response: { submittedAt: string, updatedAt: string, source: string, note: string | null } | null
  services: AvailService[]
}
const { data } = await useAsyncData(() => `avail-${route.params.slug}-${month.value}`, () => capi<Availability>(`/me/availability/${month.value}`), { watch: [month] })
const marked = ref<Set<string>>(new Set())
const note = ref('')
watchEffect(() => {
  marked.value = new Set((data.value?.services ?? []).filter((s) => s.unavailable).map((s) => s.id))
  note.value = data.value?.response?.note ?? ''
})
function set(id: string, no: boolean) {
  const next = new Set(marked.value)
  if (no) next.add(id)
  else next.delete(id)
  marked.value = next
}
const saving = ref(false)
async function save() {
  saving.value = true
  try {
    const res = await capi<{ conflictsWithSchedule: number }>(`/me/availability/${month.value}`, { method: 'PUT', body: { unavailableServiceIds: [...marked.value], note: note.value || null } })
    const n = marked.value.size
    toast.ok(n ? `Resposta enviada: você não pode em ${plural(n, 'culto', 'cultos')}.` : 'Resposta enviada: você pode em todos. Obrigado!')
    if (res.conflictsWithSchedule) toast.ok('Você já estava na escala em um desses cultos. A coordenação foi avisada.')
    await navigateTo(link(''))
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
</script>

<template>
  <section
    class="stack-lg w-640"
  >
    <BackLink
      :to="link('')"
      label="Início"
    />
    <div>
      <h1 class="h1--sm">
        {{ cap(monthName(month)) }}: em quais cultos você não pode?
      </h1>
      <p
        v-if="data?.request"
        class="soft"
        style="margin-top:8px"
      >
        Só marque os dias que não dá. Até <strong style="color:var(--ink)">{{ weekdayLong(data.request.deadlineAt, tz).replace('-feira', '') }}, {{ dayMonth(data.request.deadlineAt, tz) }}</strong>.
      </p>
      <p
        v-else
        class="soft"
        style="margin-top:8px"
      >
        A coordenação ainda não pediu as respostas deste mês, mas você já pode marcar.
      </p>
      <p
        v-if="data?.response"
        class="small muted"
        style="margin-top:6px"
      >
        Você respondeu em {{ dateTime(data.response.updatedAt, tz) }}. Pode mudar quando quiser.
      </p>
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
      class="stack-sm"
    >
      <div
        v-for="s in data.services"
        :key="s.id"
        class="card row"
        style="gap:14px;padding:14px 16px"
      >
        <DateTile
          :date="s.startsAt"
          :tz="tz"
        />
        <div
          class="grow"
          style="min-width:140px"
        >
          <p style="font-weight:700">
            {{ s.title }} <span
              v-if="s.isNew"
              class="tag tag--info"
            >novo</span>
          </p>
          <p
            class="soft small row"
            style="gap:6px;margin-top:2px"
          >
            <span
              v-if="s.liturgy.color"
              class="dot"
              :style="{ background: liturgicalHex(s.liturgy.color) ?? 'var(--muted)' }"
            />{{ hhmm(s.time) }}<template v-if="s.liturgy.season">
              · {{ s.liturgy.season }}
            </template>
          </p>
        </div>
        <div
          class="seg"
          role="group"
          :aria-label="`${s.title}, ${longDate(s.startsAt, tz)}`"
        >
          <button
            type="button"
            class="yes"
            :aria-pressed="!marked.has(s.id)"
            @click="set(s.id, false)"
          >
            Posso
          </button>
          <button
            type="button"
            class="no"
            :aria-pressed="marked.has(s.id)"
            @click="set(s.id, true)"
          >
            Não posso
          </button>
        </div>
      </div>
    </div>

    <label
      v-if="data?.services.length"
      class="field"
    >
      <span class="field__label">Algo que a coordenação deve saber? <span class="field__opt">(opcional)</span></span>
      <input
        v-model="note"
        class="input"
        maxlength="500"
        placeholder="Ex.: no dia 18 só consigo chegar às 10h"
      >
    </label>
    <button
      v-if="data?.services.length"
      type="button"
      class="btn"
      :disabled="saving"
      @click="save"
    >
      {{ marked.size ? `Enviar: não posso em ${marked.size}` : 'Enviar: posso em todos' }}
    </button>
  </section>
</template>
