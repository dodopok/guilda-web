<script setup lang="ts">
import type { Duty, Ministry, ServiceRow, Slot } from '~/types'

useHead({ title: 'Cultos' })
const route = useRoute()
const router = useRouter()
const { capi, tz, link, info } = useChurch()
const toast = useToast()
const month = computed({
  get: () => String(route.params.month),
  set: (v: string) => router.replace(link(`/coordenacao/cultos/${v}`)),
})
const { data, refresh } = await useAsyncData(() => `services-${route.params.slug}-${month.value}`, async () => {
  const [s, c] = await Promise.all([
    capi<{ services: ServiceRow[] }>(`/services?month=${month.value}`),
    capi<{ ministries: Ministry[], duties: Duty[] }>('/catalog'),
  ])
  return { services: s.services, duties: c.duties.filter((d) => d.active), ministries: c.ministries }
}, { watch: [month] })

const sundays = ref({ time: '09:30', title: 'Culto dominical' })
async function createSundays() {
  try {
    const r = await capi<{ created: unknown[] }>('/services/sundays', { method: 'POST', body: { month: month.value, ...sundays.value } })
    toast.ok(r.created.length ? `${r.created.length} ${r.created.length === 1 ? 'domingo criado' : 'domingos criados'}.` : 'Todos os domingos já tinham culto nesse horário.')
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}

// Culto avulso (especial, curto, dia de semana)
const creating = ref(false)
const newForm = reactive({ date: '', time: '19:30', durationMinutes: 90, title: '', kind: 'special', location: '', dutyIds: [] as string[] })
function openNew() {
  Object.assign(newForm, {
    date: `${month.value}-01`, time: '19:30', durationMinutes: 90, title: '', kind: 'special',
    location: info.value?.church.defaultLocation ?? '',
    dutyIds: (data.value?.duties ?? []).filter((d) => d.includeByDefault).map((d) => d.id),
  })
  creating.value = true
}
async function createOne() {
  try {
    await capi('/services', { method: 'POST', body: { ...newForm, location: newForm.location || null } })
    toast.ok('Culto cadastrado.')
    creating.value = false
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}

// Edição
const editing = ref<ServiceRow | null>(null)
const editForm = reactive({ date: '', time: '', durationMinutes: 120, title: '', kind: 'regular', location: '', notes: '', notifyNow: false })
function openEdit(s: ServiceRow) {
  editing.value = s
  Object.assign(editForm, {
    date: s.localDate, time: s.time, title: s.title, kind: s.kind, location: s.location ?? '', notes: s.notes ?? '', notifyNow: false,
    durationMinutes: Math.round((Date.parse(s.endsAt) - Date.parse(s.startsAt)) / 60000),
  })
}
const editOpen = computed({ get: () => Boolean(editing.value), set: (v) => { if (!v) editing.value = null } })
async function saveEdit(status?: 'cancelled' | 'scheduled') {
  if (!editing.value) return
  try {
    await capi(`/services/${editing.value.id}`, { method: 'PATCH', body: { ...editForm, location: editForm.location || null, notes: editForm.notes || null, ...(status ? { status } : {}) } })
    toast.ok(status === 'cancelled' ? 'Culto cancelado. Quem estava escalado ficou com a tarefa pendente.' : status === 'scheduled' ? 'Culto restaurado.' : 'Culto atualizado.')
    editing.value = null
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}
async function removeService() {
  if (!editing.value) return
  try {
    await capi(`/services/${editing.value.id}`, { method: 'DELETE' })
    toast.ok('Culto apagado.')
    editing.value = null
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}

// Postos
const slotService = ref<ServiceRow | null>(null)
const slotOpen = computed({ get: () => Boolean(slotService.value), set: (v) => { if (!v) slotService.value = null } })
const addDuty = ref('')
async function addSlot() {
  if (!slotService.value || !addDuty.value) return
  try {
    await capi(`/services/${slotService.value.id}/slots`, { method: 'POST', body: { dutyId: addDuty.value } })
    addDuty.value = ''
    await refresh()
    slotService.value = data.value?.services.find((s) => s.id === slotService.value!.id) ?? null
  } catch (e) {
    toast.error(e)
  }
}
async function updateSlot(slot: Slot, patch: Record<string, unknown>) {
  try {
    await capi(`/slots/${slot.id}`, { method: 'PATCH', body: patch })
    await refresh()
    slotService.value = data.value?.services.find((s) => s.id === slotService.value!.id) ?? null
  } catch (e) {
    toast.error(e)
  }
}
async function removeSlot(slot: Slot) {
  try {
    await capi(`/slots/${slot.id}`, { method: 'DELETE' })
    await refresh()
    slotService.value = data.value?.services.find((s) => s.id === slotService.value!.id) ?? null
  } catch (e) {
    toast.error(e)
  }
}
const KIND: Record<string, string> = { regular: 'comum', special: 'especial', short: 'curto' }
</script>

<template>
  <div class="page page--wide">
    <div class="page-head">
      <p class="kicker">
        Mês a mês
      </p>
      <div class="row row--between">
        <h1>Cultos</h1>
        <MonthSwitch v-model="month" />
      </div>
      <p class="lede">
        Cadastre todos os cultos do mês antes de pedir as indisponibilidades. Vários cultos no mesmo dia são permitidos.
      </p>
    </div>

    <form
      class="notice notice--accent"
      style="margin-bottom:2rem"
      @submit.prevent="createSundays"
    >
      <h3>Criar os domingos de {{ monthName(month) }}</h3>
      <div
        class="row"
        style="align-items:flex-end"
      >
        <label
          class="field"
          style="margin:0"
        ><span class="field__label">Horário</span><input
          v-model="sundays.time"
          class="input"
          type="time"
          required
          style="width:8rem"
        ></label>
        <label
          class="field"
          style="margin:0;flex:1;min-width:12rem"
        ><span class="field__label">Nome</span><input
          v-model="sundays.title"
          class="input"
          required
        ></label>
        <button class="btn btn--primary">
          Criar domingos
        </button>
        <button
          type="button"
          class="btn"
          @click="openNew"
        >
          <Icon name="plus" /> Outro culto
        </button>
      </div>
      <p
        class="small ink-2"
        style="margin-top:.5rem"
      >
        Domingos que já têm culto nesse horário não são duplicados.
      </p>
    </form>

    <EmptyState
      v-if="!data?.services.length"
      :title="`Nenhum culto em ${monthName(month)}`"
      text="Crie os domingos acima e acrescente cultos especiais, como Quarta-feira de Cinzas ou Tríduo Pascal."
    />
    <ul
      v-else
      class="agenda"
    >
      <li
        v-for="s in data.services"
        :key="s.id"
      >
        <DateBlock
          :at="s.startsAt"
          :tz="tz"
        />
        <div>
          <div class="line">
            <span class="line__main">
              <span
                class="line__title"
                style="font-size:1.12rem"
                :style="s.status === 'cancelled' ? 'text-decoration:line-through' : ''"
              >{{ s.title }}</span>
              <span
                v-if="s.status === 'cancelled'"
                class="tag tag--no"
                style="margin-left:.4rem"
              >cancelado</span>
              <span
                v-else-if="s.kind !== 'regular'"
                class="tag tag--plain"
                style="margin-left:.4rem"
              >{{ KIND[s.kind] }}</span>
              <span
                class="line__sub"
                style="display:block"
              >{{ time(s.startsAt, tz) }} às {{ time(s.endsAt, tz) }}<template v-if="s.location"> · {{ s.location }}</template> · {{ s.slots.length }} postos</span>
            </span>
            <span
              class="row"
              style="gap:.4rem"
            >
              <button
                type="button"
                class="btn btn--small"
                @click="slotService = s"
              >Postos</button>
              <button
                type="button"
                class="btn btn--small"
                @click="openEdit(s)"
              ><Icon name="edit" /> Editar</button>
            </span>
          </div>
          <p
            class="small muted"
            style="margin-top:.35rem"
          >
            {{ s.slots.map((sl) => sl.requiredCount > 1 ? `${sl.dutyName} (${sl.requiredCount})` : sl.dutyName).join(' · ') }}
          </p>
        </div>
      </li>
    </ul>
    <p
      v-if="data?.services.length"
      style="margin-top:1.5rem"
      class="row"
    >
      <NuxtLink
        class="btn"
        :to="link(`/coordenacao/disponibilidade/${month}`)"
      >Próximo passo: pedir indisponibilidades <Icon name="arrow-right" /></NuxtLink>
    </p>

    <Sheet
      v-model:open="creating"
      title="Novo culto"
      wide
    >
      <form
        id="new-service"
        @submit.prevent="createOne"
      >
        <div class="fields-2">
          <label class="field"><span class="field__label">Nome</span><input
            v-model="newForm.title"
            class="input"
            required
            placeholder="Ex.: Quarta-feira de Cinzas"
          ></label>
          <label class="field"><span class="field__label">Tipo</span>
            <select
              v-model="newForm.kind"
              class="select"
            ><option value="regular">Comum</option><option value="special">Especial</option><option value="short">Curto</option></select>
          </label>
        </div>
        <div
          class="fields-2"
          style="margin-top:1.1rem"
        >
          <label class="field"><span class="field__label">Data</span><input
            v-model="newForm.date"
            class="input"
            type="date"
            required
          ></label>
          <label class="field"><span class="field__label">Início</span><input
            v-model="newForm.time"
            class="input"
            type="time"
            required
          ></label>
        </div>
        <div
          class="fields-2"
          style="margin-top:1.1rem"
        >
          <label class="field"><span class="field__label">Duração (minutos)</span><input
            v-model.number="newForm.durationMinutes"
            class="input"
            type="number"
            min="15"
            max="600"
          ></label>
          <label class="field"><span class="field__label">Local</span><input
            v-model="newForm.location"
            class="input"
          ></label>
        </div>
        <fieldset style="margin-top:1.25rem">
          <legend>Postos deste culto</legend>
          <div
            v-for="m in data?.ministries"
            :key="m.id"
          >
            <p
              v-if="data!.duties.some((d) => d.ministryId === m.id)"
              class="kicker"
              style="margin-top:.5rem"
            >
              {{ m.name }}
            </p>
            <div
              class="row"
              style="gap:0 1.25rem"
            >
              <label
                v-for="d in data!.duties.filter((x) => x.ministryId === m.id)"
                :key="d.id"
                class="check"
              >
                <input
                  v-model="newForm.dutyIds"
                  type="checkbox"
                  :value="d.id"
                ><span class="check__text">{{ d.name }}</span>
              </label>
            </div>
          </div>
        </fieldset>
      </form>
      <template #foot>
        <button
          type="button"
          class="btn"
          @click="creating = false"
        >
          Cancelar
        </button>
        <button
          type="submit"
          form="new-service"
          class="btn btn--primary"
        >
          Cadastrar culto
        </button>
      </template>
    </Sheet>

    <Sheet
      v-model:open="editOpen"
      :title="editing ? `${editing.title} · ${shortDate(editing.startsAt, tz)}` : ''"
    >
      <form
        v-if="editing"
        id="edit-service"
        @submit.prevent="saveEdit()"
      >
        <label class="field"><span class="field__label">Nome</span><input
          v-model="editForm.title"
          class="input"
          required
        ></label>
        <div
          class="fields-2"
          style="margin-top:1.1rem"
        >
          <label class="field"><span class="field__label">Data</span><input
            v-model="editForm.date"
            class="input"
            type="date"
            required
          ></label>
          <label class="field"><span class="field__label">Início</span><input
            v-model="editForm.time"
            class="input"
            type="time"
            required
          ></label>
        </div>
        <div
          class="fields-2"
          style="margin-top:1.1rem"
        >
          <label class="field"><span class="field__label">Duração (minutos)</span><input
            v-model.number="editForm.durationMinutes"
            class="input"
            type="number"
            min="15"
            max="600"
          ></label>
          <label class="field"><span class="field__label">Tipo</span>
            <select
              v-model="editForm.kind"
              class="select"
            ><option value="regular">Comum</option><option value="special">Especial</option><option value="short">Curto</option></select>
          </label>
        </div>
        <label class="field"><span class="field__label">Local</span><input
          v-model="editForm.location"
          class="input"
        ></label>
        <label class="field"><span class="field__label">Observações</span><textarea
          v-model="editForm.notes"
          class="textarea"
          style="min-height:4rem"
        /></label>
        <label class="check"><input
          v-model="editForm.notifyNow"
          type="checkbox"
        ><span class="check__text">Avisar agora pelo WhatsApp quem está escalado <span
          class="muted small"
          style="display:block"
        >Se o lembrete da semana já saiu, a correção é enviada automaticamente de qualquer forma.</span></span></label>
      </form>
      <template #foot>
        <button
          v-if="editing?.status === 'scheduled'"
          type="button"
          class="btn btn--no"
          style="margin-right:auto"
          @click="saveEdit('cancelled')"
        >
          Cancelar culto
        </button>
        <button
          v-else
          type="button"
          class="btn"
          style="margin-right:auto"
          @click="saveEdit('scheduled')"
        >
          Restaurar culto
        </button>
        <button
          type="button"
          class="btn btn--quiet"
          @click="removeService"
        >
          Apagar
        </button>
        <button
          type="submit"
          form="edit-service"
          class="btn btn--primary"
        >
          Salvar
        </button>
      </template>
    </Sheet>

    <Sheet
      v-model:open="slotOpen"
      :title="slotService ? `Postos · ${shortDate(slotService.startsAt, tz)}` : ''"
      wide
    >
      <template v-if="slotService">
        <p class="ink-2">
          Quantas pessoas cada função precisa e, se diferente do padrão, a hora de chegada neste culto.
        </p>
        <div
          class="table-wrap"
          style="margin-top:1rem"
        >
          <table class="table">
            <thead>
              <tr>
                <th scope="col">
                  Função
                </th><th scope="col">
                  Pessoas
                </th><th scope="col">
                  Chegada neste culto
                </th><th scope="col">
                  <span class="sr-only">Remover</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="sl in slotService.slots"
                :key="sl.id"
              >
                <th scope="row">
                  {{ sl.dutyName }}
                </th>
                <td>
                  <input
                    class="input"
                    style="width:5.5rem"
                    type="number"
                    min="1"
                    max="50"
                    :value="sl.requiredCount"
                    :aria-label="`Pessoas em ${sl.dutyName}`"
                    @change="updateSlot(sl, { requiredCount: Number(($event.target as HTMLInputElement).value) })"
                  >
                </td>
                <td>
                  <input
                    class="input"
                    style="width:8.5rem"
                    type="time"
                    :value="sl.arrivalAt ? isoToLocalParts(sl.arrivalAt, tz).time : ''"
                    :aria-label="`Chegada de ${sl.dutyName}`"
                    @change="updateSlot(sl, { arrivalTime: ($event.target as HTMLInputElement).value || null })"
                  >
                </td>
                <td style="text-align:right">
                  <button
                    type="button"
                    class="btn btn--icon btn--small btn--no"
                    :aria-label="`Remover ${sl.dutyName}`"
                    @click="removeSlot(sl)"
                  >
                    <Icon name="trash" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <form
          class="row"
          style="margin-top:1rem"
          @submit.prevent="addSlot"
        >
          <label
            class="sr-only"
            for="add-duty"
          >Adicionar posto</label>
          <select
            id="add-duty"
            v-model="addDuty"
            class="select"
            style="max-width:20rem"
          >
            <option value="">
              Adicionar função…
            </option>
            <option
              v-for="d in data?.duties"
              :key="d.id"
              :value="d.id"
            >
              {{ d.name }}
            </option>
          </select>
          <button
            class="btn"
            :disabled="!addDuty"
          >
            Adicionar posto
          </button>
        </form>
        <p
          class="small muted"
          style="margin-top:.75rem"
        >
          Mudar a chegada de um posto já publicado deixa a confirmação dessas pessoas pendente de novo.
        </p>
      </template>
    </Sheet>
  </div>
</template>
