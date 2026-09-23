<script setup lang="ts">
import type { Duty, Ministry } from '~/types'

useHead({ title: 'Funções' })
const route = useRoute()
const { capi } = useChurch()
const toast = useToast()
const { data, refresh } = await useAsyncData(`catalog-${route.params.slug}`, () => capi<{ ministries: Ministry[], duties: Duty[] }>('/catalog'))

const KINDS: Record<string, string> = { general: 'Geral', sermon: 'Pregação (escolhe as músicas)', reading: 'Leitura', presiding: 'Presidência', music: 'Louvor' }
function arrivalText(d: Duty) {
  if (d.arrivalMinutesBefore === null) return 'chegada a definir'
  if (d.arrivalMinutesBefore === 0) return 'chegar no início'
  const h = Math.floor(d.arrivalMinutesBefore / 60)
  const m = d.arrivalMinutesBefore % 60
  return `chegar ${h ? `${h}h` : ''}${m ? `${String(m).padStart(h ? 2 : 1, '0')}${h ? '' : ' min'}` : ''} antes`
}

const editing = ref<Partial<Duty> | null>(null)
const form = reactive({ ministryId: '', name: '', instructions: '', arrival: '' as string | number, kind: 'general', receivesMusicNotice: false, defaultRequiredCount: 1, includeByDefault: true, active: true })
function open(d?: Duty, ministryId?: string) {
  editing.value = d ?? {}
  Object.assign(form, d
    ? { ministryId: d.ministryId, name: d.name, instructions: d.instructions ?? '', arrival: d.arrivalMinutesBefore ?? '', kind: d.kind, receivesMusicNotice: d.receivesMusicNotice, defaultRequiredCount: d.defaultRequiredCount, includeByDefault: d.includeByDefault, active: d.active }
    : { ministryId: ministryId ?? data.value?.ministries[0]?.id ?? '', name: '', instructions: '', arrival: '', kind: 'general', receivesMusicNotice: false, defaultRequiredCount: 1, includeByDefault: true, active: true })
}
const sheet = computed({ get: () => Boolean(editing.value), set: (v) => { if (!v) editing.value = null } })
const error = ref('')
async function save() {
  error.value = ''
  const body = {
    ministryId: form.ministryId,
    name: form.name,
    instructions: form.instructions || null,
    arrivalMinutesBefore: form.arrival === '' ? null : Number(form.arrival),
    kind: form.kind,
    receivesMusicNotice: form.receivesMusicNotice,
    defaultRequiredCount: Number(form.defaultRequiredCount),
    includeByDefault: form.includeByDefault,
    active: form.active,
  }
  try {
    if (editing.value?.id) await capi(`/duties/${editing.value.id}`, { method: 'PATCH', body })
    else await capi('/duties', { method: 'POST', body })
    toast.ok('Função salva.')
    editing.value = null
    await refresh()
  } catch (e) {
    error.value = apiErrorMessage(e)
  }
}
async function remove() {
  if (!editing.value?.id) return
  try {
    const r = await capi<{ deleted: boolean }>(`/duties/${editing.value.id}`, { method: 'DELETE' })
    toast.ok(r.deleted ? 'Função removida.' : 'Esta função já foi usada em escalas: ela foi desativada para manter o histórico.')
    editing.value = null
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}
const newMinistry = ref('')
async function addMinistry() {
  if (!newMinistry.value.trim()) return
  try {
    await capi('/ministries', { method: 'POST', body: { name: newMinistry.value.trim(), position: data.value?.ministries.length ?? 0 } })
    newMinistry.value = ''
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}
</script>

<template>
  <div class="page page--wide">
    <div class="page-head">
      <p class="kicker">
        Cadastro
      </p>
      <h1>Funções</h1>
      <p class="lede">
        O que cada pessoa faz, quando chega e o que precisa saber. As instruções aparecem para quem estiver escalado.
      </p>
    </div>
    <section
      v-for="m in data?.ministries ?? []"
      :key="m.id"
      class="section"
      style="margin-top:2rem"
    >
      <div class="section-head">
        <h2>{{ m.name }}</h2>
        <button
          type="button"
          class="btn btn--quiet btn--small"
          @click="open(undefined, m.id)"
        >
          <Icon name="plus" /> Função
        </button>
      </div>
      <ul class="lines">
        <li
          v-for="d in (data?.duties ?? []).filter((x) => x.ministryId === m.id)"
          :key="d.id"
          class="line"
        >
          <span class="line__main">
            <button
              type="button"
              class="btn btn--quiet"
              style="padding:0;min-height:0;color:var(--ink);text-decoration:none"
              @click="open(d)"
            ><span class="line__title">{{ d.name }}</span></button>
            <span
              v-if="!d.active"
              class="tag tag--plain"
              style="margin-left:.4rem"
            >inativa</span>
            <span
              class="line__sub"
              style="display:block"
            >
              {{ arrivalText(d) }} · {{ d.defaultRequiredCount === 1 ? '1 pessoa' : `${d.defaultRequiredCount} pessoas` }}{{ d.kind !== 'general' ? ` · ${KINDS[d.kind]}` : '' }}{{ d.receivesMusicNotice ? ' · recebe aviso das músicas' : '' }}{{ !d.includeByDefault ? ' · não entra automaticamente nos cultos' : '' }}
            </span>
            <span
              v-if="d.instructions"
              class="small ink-2"
              style="display:block;margin-top:.2rem"
            >{{ d.instructions }}</span>
            <span
              v-else
              class="small"
              style="display:block;margin-top:.2rem;color:var(--wait)"
            >Sem instruções ainda.</span>
          </span>
          <button
            type="button"
            class="btn btn--small"
            @click="open(d)"
          >
            <Icon name="edit" /> Editar
          </button>
        </li>
      </ul>
    </section>
    <form
      class="row section"
      @submit.prevent="addMinistry"
    >
      <label
        class="sr-only"
        for="new-ministry"
      >Novo ministério</label>
      <input
        id="new-ministry"
        v-model="newMinistry"
        class="input"
        style="max-width:20rem"
        placeholder="Nome do novo ministério"
      >
      <button class="btn">
        Adicionar ministério
      </button>
    </form>

    <Sheet
      v-model:open="sheet"
      :title="editing?.id ? form.name : 'Nova função'"
    >
      <form
        id="duty-form"
        @submit.prevent="save"
      >
        <div class="fields-2">
          <label class="field"><span class="field__label">Nome</span><input
            v-model="form.name"
            class="input"
            required
          ></label>
          <label class="field"><span class="field__label">Ministério</span>
            <select
              v-model="form.ministryId"
              class="select"
            ><option
              v-for="m in data?.ministries"
              :key="m.id"
              :value="m.id"
            >{{ m.name }}</option></select>
          </label>
        </div>
        <label class="field"><span class="field__label">Instruções</span>
          <textarea
            v-model="form.instructions"
            class="textarea"
            placeholder="O que fazer, o que preparar, o que guardar ao final."
          />
        </label>
        <div class="fields-2">
          <label class="field"><span class="field__label">Chegar quantos minutos antes?</span>
            <input
              v-model="form.arrival"
              class="input"
              type="number"
              min="0"
              max="600"
              inputmode="numeric"
              placeholder="A definir"
            >
            <span class="field__hint">Vazio = horário ainda não definido. O lembrete nunca inventa um horário.</span>
          </label>
          <label class="field"><span class="field__label">Pessoas por culto</span><input
            v-model="form.defaultRequiredCount"
            class="input"
            type="number"
            min="1"
            max="50"
          ></label>
        </div>
        <label class="field"><span class="field__label">Tipo</span>
          <select
            v-model="form.kind"
            class="select"
          ><option
            v-for="(l, k) in KINDS"
            :key="k"
            :value="k"
          >{{ l }}</option></select>
        </label>
        <label class="check"><input
          v-model="form.receivesMusicNotice"
          type="checkbox"
        ><span class="check__text">Recebe aviso individual quando as músicas forem escolhidas</span></label>
        <label class="check"><input
          v-model="form.includeByDefault"
          type="checkbox"
        ><span class="check__text">Incluir automaticamente nos cultos novos</span></label>
        <label class="check"><input
          v-model="form.active"
          type="checkbox"
        ><span class="check__text">Ativa</span></label>
        <p
          v-if="error"
          class="field__error"
          role="alert"
        >
          {{ error }}
        </p>
      </form>
      <template #foot>
        <button
          v-if="editing?.id"
          type="button"
          class="btn btn--no"
          style="margin-right:auto"
          @click="remove"
        >
          Remover
        </button>
        <button
          type="button"
          class="btn"
          @click="editing = null"
        >
          Cancelar
        </button>
        <button
          type="submit"
          form="duty-form"
          class="btn btn--primary"
        >
          Salvar
        </button>
      </template>
    </Sheet>
  </div>
</template>
