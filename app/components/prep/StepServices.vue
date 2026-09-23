<script setup lang="ts">
import type { Duty, ServiceRow } from '~/types'

// Passo 1: os cultos do mês. Na primeira visita, os domingos já entram no horário de sempre.
const props = defineProps<{ month: string }>()
const emit = defineEmits<{ (e: 'next' | 'changed'): void }>()
const { capi, tz } = useChurch()
const toast = useToast()

const { data, refresh } = await useAsyncData(() => `prep-services-${props.month}`, () => capi<{ services: ServiceRow[] }>(`/services?month=${props.month}`), { watch: [() => props.month] })
const { data: catalog } = await useAsyncData('prep-catalog', () => capi<{ duties: Duty[] }>('/catalog'))
const services = computed(() => (data.value?.services ?? []).filter((s) => s.status === 'scheduled'))

// Horário de sempre: o do último culto comum cadastrado, ou 9h30.
async function usualTime() {
  const prev = await capi<{ services: ServiceRow[] }>(`/services?month=${shiftMonth(props.month, -1)}`).catch(() => ({ services: [] as ServiceRow[] }))
  const regular = prev.services.filter((s) => s.kind === 'regular' && s.status === 'scheduled')
  return regular.at(-1)?.time ?? '09:30'
}
const autoFilled = ref(false)
onMounted(async () => {
  if (data.value && !data.value.services.length && props.month >= currentMonth(tz.value)) {
    try {
      const time = await usualTime()
      await capi('/services/sundays', { method: 'POST', body: { month: props.month, time, title: 'Culto dominical', durationMinutes: 120 } })
      autoFilled.value = true
      await refresh()
      emit('changed')
    } catch (e) {
      toast.error(e)
    }
  }
})
const firstTime = computed(() => services.value.find((s) => s.kind === 'regular')?.time ?? '09:30')

function summary(s: ServiceRow) {
  const people = s.slots.reduce((n, x) => n + x.requiredCount, 0)
  return `${plural(s.slots.length, 'função', 'funções')} · ${plural(people, 'pessoa', 'pessoas')}`
}
async function remove(s: ServiceRow) {
  if (!window.confirm(`Tirar ${s.title} de ${longDate(s.startsAt, tz.value)}?`)) return
  try {
    await capi(`/services/${s.id}`, { method: 'DELETE' })
    toast.ok(`Culto retirado de ${monthName(props.month)}.`)
    await refresh()
    emit('changed')
  } catch (e) {
    toast.error(e)
  }
}

// Funções de um culto: quantas pessoas cada uma precisa neste dia.
const slotsOf = ref<ServiceRow | null>(null)
const slotsOpen = computed({ get: () => Boolean(slotsOf.value), set: (v) => { if (!v) slotsOf.value = null } })
const current = computed(() => services.value.find((s) => s.id === slotsOf.value?.id) ?? null)
const missingDuties = computed(() => (catalog.value?.duties ?? []).filter((d) => d.active && !current.value?.slots.some((sl) => sl.dutyId === d.id)))
async function setCount(slotId: string, n: number) {
  try {
    if (n < 1) await capi(`/slots/${slotId}`, { method: 'DELETE' })
    else await capi(`/slots/${slotId}`, { method: 'PATCH', body: { requiredCount: Math.min(n, 50) } })
    await refresh()
    emit('changed')
  } catch (e) {
    toast.error(e)
  }
}
async function addDuty(dutyId: string) {
  if (!current.value) return
  try {
    await capi(`/services/${current.value.id}/slots`, { method: 'POST', body: { dutyId } })
    await refresh()
    emit('changed')
  } catch (e) {
    toast.error(e)
  }
}
function arrival(sl: ServiceRow['slots'][number]) {
  return sl.arrivalAt ? `chega ${time(sl.arrivalAt, tz.value)}` : 'horário a combinar'
}

// Novo culto.
const addOpen = ref(false)
const form = reactive({ title: '', date: '', time: '19:30', kind: 'special' as 'regular' | 'special' | 'short' })
function openAdd() {
  Object.assign(form, { title: '', date: `${props.month}-15`, time: '19:30', kind: 'special' })
  addOpen.value = true
}
async function addService() {
  if (!form.title.trim() || !form.date) {
    toast.error('Dê um nome e escolha o dia.')
    return
  }
  // Cultos especiais e curtos entram com as funções principais (presidir, ler, pregar,
  // música); o restante se acrescenta em "Funções".
  const main = form.kind === 'regular' ? undefined : (catalog.value?.duties ?? []).filter((d) => d.active && d.kind !== 'general').map((d) => d.id)
  try {
    await capi('/services', { method: 'POST', body: { title: form.title.trim(), date: form.date, time: form.time, kind: form.kind, durationMinutes: form.kind === 'short' ? 60 : 90, ...(main ? { dutyIds: main } : {}) } })
    toast.ok(`${form.title.trim()} entrou em ${monthName(props.month)}.`)
    addOpen.value = false
    await refresh()
    emit('changed')
  } catch (e) {
    toast.error(e)
  }
}
const KIND: Record<string, string> = { special: 'especial', short: 'curto' }
</script>

<template>
  <div class="stack-md w-720">
    <div>
      <h2 class="h2">
        Quais cultos acontecem em {{ monthName(month) }}?
      </h2>
      <p class="lede">
        {{ autoFilled || services.length ? `Já colocamos os domingos às ${hhmm(firstTime)}. Ajuste se precisar.` : 'Acrescente os cultos do mês.' }}
      </p>
    </div>
    <div
      v-for="s in services"
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
        style="min-width:180px"
      >
        <p
          class="strong row"
          style="gap:8px"
        >
          {{ s.title }}<span
            v-if="KIND[s.kind]"
            class="tag tag--info"
          >{{ KIND[s.kind] }}</span>
        </p>
        <p
          class="soft small"
          style="margin-top:2px"
        >
          {{ hhmm(s.time) }} · {{ summary(s) }}
        </p>
      </div>
      <div
        class="row"
        style="gap:6px"
      >
        <button
          type="button"
          class="btn btn--line btn--sm"
          @click="slotsOf = s"
        >
          Funções
        </button>
        <button
          type="button"
          class="icon-btn"
          :aria-label="`Tirar ${s.title} de ${longDate(s.startsAt, tz)}`"
          @click="remove(s)"
        >
          <Icon
            name="x"
            :weight="2"
          />
        </button>
      </div>
    </div>
    <button
      type="button"
      class="btn btn--dashed"
      @click="openAdd"
    >
      <Icon
        name="plus"
        :weight="2"
      />Adicionar outro culto
    </button>
    <div
      class="row"
      style="margin-top:6px"
    >
      <button
        type="button"
        class="btn"
        :disabled="!services.length"
        @click="emit('next')"
      >
        Confirmar cultos e seguir<Icon
          name="arrow-right"
          :weight="2.2"
        />
      </button>
    </div>

    <Sheet
      v-model:open="slotsOpen"
      title="Funções deste culto"
    >
      <template v-if="current">
        <p class="sheet__lede">
          {{ longDate(current.startsAt, tz) }} · {{ hhmm(current.time) }}. Quantas pessoas cada função precisa neste dia.
        </p>
        <div
          v-for="sl in current.slots"
          :key="sl.id"
          class="row"
          style="flex-wrap:nowrap;padding:10px 0;border-top:1px solid var(--line-2)"
        >
          <span class="grow"><span
            class="strong"
            style="display:block"
          >{{ sl.dutyName }}</span><span
            class="muted small"
            style="display:block"
          >{{ arrival(sl) }}</span></span>
          <span
            class="row"
            style="flex-wrap:nowrap;gap:6px;background:var(--surface-3);border-radius:12px;padding:3px"
          >
            <button
              type="button"
              class="icon-btn"
              style="border:0;width:36px;height:36px;border-radius:10px"
              :aria-label="sl.requiredCount > 1 ? `Menos uma pessoa em ${sl.dutyName}` : `Tirar ${sl.dutyName} deste culto`"
              @click="setCount(sl.id, sl.requiredCount - 1)"
            >
              <Icon
                :name="sl.requiredCount > 1 ? 'minus' : 'trash'"
                :weight="2.2"
              />
            </button>
            <span
              class="strong"
              style="min-width:24px;text-align:center"
            >{{ sl.requiredCount }}</span>
            <button
              type="button"
              class="icon-btn"
              style="border:0;width:36px;height:36px;border-radius:10px"
              :aria-label="`Mais uma pessoa em ${sl.dutyName}`"
              @click="setCount(sl.id, sl.requiredCount + 1)"
            >
              <Icon
                name="plus"
                :weight="2.2"
              />
            </button>
          </span>
        </div>
        <template v-if="missingDuties.length">
          <p
            class="caps"
            style="margin:16px 0 8px"
          >
            Acrescentar função
          </p>
          <div class="chips">
            <button
              v-for="d in missingDuties"
              :key="d.id"
              type="button"
              class="chip"
              @click="addDuty(d.id)"
            >
              <Icon
                name="plus"
                :weight="2.4"
              />{{ d.name }}
            </button>
          </div>
        </template>
        <button
          type="button"
          class="btn btn--block"
          style="margin-top:14px;min-height:50px"
          @click="slotsOf = null"
        >
          Pronto
        </button>
      </template>
    </Sheet>

    <Sheet
      v-model:open="addOpen"
      title="Adicionar um culto"
      lede="Cultos especiais entram com as funções principais; ajuste depois se precisar."
    >
      <form
        class="stack-md"
        @submit.prevent="addService"
      >
        <label class="field">
          <span class="field__label">Como vamos chamar?</span>
          <input
            v-model="form.title"
            class="input"
            placeholder="Ex.: Vigília de oração"
          >
        </label>
        <div
          class="row"
          style="flex-wrap:nowrap"
        >
          <label class="field grow">
            <span class="field__label">Dia</span>
            <input
              v-model="form.date"
              type="date"
              class="input"
              :min="`${month}-01`"
              :max="`${month}-31`"
            >
          </label>
          <label
            class="field"
            style="width:120px"
          >
            <span class="field__label">Hora</span>
            <input
              v-model="form.time"
              type="time"
              class="input"
            >
          </label>
        </div>
        <div>
          <p class="field__label">
            Tipo
          </p>
          <div
            class="chips"
            role="group"
            aria-label="Tipo de culto"
          >
            <button
              v-for="k in [['regular', 'Comum'], ['special', 'Especial'], ['short', 'Curto']] as const"
              :key="k[0]"
              type="button"
              class="chip chip--lg chip--dark"
              :aria-pressed="form.kind === k[0]"
              @click="form.kind = k[0]"
            >
              {{ k[1] }}
            </button>
          </div>
        </div>
        <button class="btn btn--block">
          Adicionar a {{ monthName(month) }}
        </button>
      </form>
    </Sheet>
  </div>
</template>
