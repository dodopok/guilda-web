<script setup lang="ts">
import type { Duty, EditableBlock } from '~/types'

useHead({ title: 'Modelo' })
const route = useRoute()
const id = String(route.params.id)
const { capi, link } = useChurch()
const toast = useToast()
interface TemplateFull { id: string, name: string, kind: string, description: string | null, blocks: { id: string, type: string, title: string, body: string | null, textSource: string, dutyId: string | null }[] }
const { data, refresh } = await useAsyncData(`template-${id}`, async () => {
  const [t, c] = await Promise.all([capi<{ template: TemplateFull }>(`/templates/${id}`), capi<{ duties: Duty[] }>('/catalog')])
  return { template: t.template, duties: c.duties.filter((d) => d.active) }
})
const form = reactive({ name: '', kind: 'regular', description: '' })
const blocks = ref<EditableBlock[]>([])
const baseline = ref('')
function load() {
  const t = data.value?.template
  if (!t) return
  Object.assign(form, { name: t.name, kind: t.kind, description: t.description ?? '' })
  blocks.value = t.blocks.map((b) => ({ key: b.id, type: b.type, title: b.title, body: b.body, textSource: b.textSource, dutyId: b.dutyId, personId: null, data: {} }))
  baseline.value = ser()
}
function ser() {
  return JSON.stringify([form, blocks.value.map((b) => [b.type, b.title, b.body, b.textSource, b.dutyId])])
}
watch(data, load, { immediate: true })
const dirty = computed(() => ser() !== baseline.value)
async function save() {
  try {
    await capi(`/templates/${id}`, { method: 'PATCH', body: { name: form.name, kind: form.kind, description: form.description || null, blocks: blocks.value.map((b) => ({ type: b.type, title: b.title, body: b.body, textSource: b.textSource, dutyId: b.dutyId })) } })
    toast.ok('Modelo salvo. Roteiros já criados não mudam.')
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}
</script>

<template>
  <div class="page">
    <p style="margin-bottom:1rem">
      <NuxtLink :to="link('/coordenacao/modelos')"><Icon
        name="arrow-left"
        style="width:1rem;height:1rem;vertical-align:-.15em"
      /> Modelos</NuxtLink>
    </p>
    <template v-if="data">
      <div class="page-head">
        <p class="kicker">
          Modelo de liturgia
        </p>
        <h1>{{ form.name }}</h1>
      </div>
      <div class="fields-2">
        <label class="field"><span class="field__label">Nome</span><input
          v-model="form.name"
          class="input"
        ></label>
        <label class="field"><span class="field__label">Tipo</span><select
          v-model="form.kind"
          class="select"
        ><option value="regular">Comum</option><option value="special">Especial</option><option value="short">Curto</option></select></label>
      </div>
      <label
        class="field"
        style="margin-top:1.1rem"
      ><span class="field__label">Descrição</span><input
        v-model="form.description"
        class="input"
      ></label>
      <div class="section">
        <div class="section-head">
          <h2>Blocos</h2><span class="small muted">na ordem do culto</span>
        </div>
        <div style="margin-top:1rem">
          <BlockListEditor
            v-model="blocks"
            mode="template"
            :duties="data.duties"
          />
        </div>
      </div>
      <div
        class="row"
        style="position:sticky;bottom:calc(var(--tab-h) + .5rem);background:var(--paper);padding:.75rem 0;margin-top:1.5rem;border-top:1px solid var(--rule)"
      >
        <button
          type="button"
          class="btn btn--primary"
          :disabled="!dirty"
          @click="save"
        >
          {{ dirty ? 'Salvar modelo' : 'Tudo salvo' }}
        </button>
      </div>
    </template>
  </div>
</template>
