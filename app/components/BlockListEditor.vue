<script setup lang="ts">
// Editor de blocos da liturgia, usado em modelos e roteiros.
import type { EditableBlock } from '~/types'

const model = defineModel<EditableBlock[]>({ required: true })
defineProps<{
  mode: 'template' | 'script'
  duties: { id: string, name: string }[]
  people?: { id: string, displayName: string }[]
}>()

const TYPES = ['rite', 'reading', 'psalm', 'collect', 'sermon', 'music', 'announcements', 'text', 'heading']
let seq = 0
function newKey() {
  seq += 1
  return `new-${Date.now()}-${seq}`
}
function move(i: number, d: number) {
  const next = [...model.value]
  const [x] = next.splice(i, 1)
  next.splice(i + d, 0, x!)
  model.value = next
}
function remove(i: number) {
  model.value = model.value.filter((_, j) => j !== i)
}
const addType = ref('rite')
function add() {
  model.value = [...model.value, {
    key: newKey(), type: addType.value, title: BLOCK_TYPE_LABEL[addType.value] ?? 'Bloco', body: null,
    textSource: 'church', dutyId: null, personId: null, data: addType.value === 'announcements' ? { items: [] } : {},
  }]
}
function update(i: number, patch: Partial<EditableBlock>) {
  model.value = model.value.map((b, j) => (j === i ? { ...b, ...patch } : b))
}
function updateData(i: number, patch: Partial<EditableBlock['data']>) {
  const b = model.value[i]!
  update(i, { data: { ...b.data, ...patch } })
}
function addItem(i: number) {
  const items = [...(model.value[i]!.data.items ?? []), { text: '', ownerPersonId: null, status: 'draft' as const }]
  updateData(i, { items })
}
function updateItem(i: number, k: number, patch: Record<string, unknown>) {
  const items = (model.value[i]!.data.items ?? []).map((it, j) => (j === k ? { ...it, ...patch } : it))
  updateData(i, { items })
}
function removeItem(i: number, k: number) {
  updateData(i, { items: (model.value[i]!.data.items ?? []).filter((_, j) => j !== k) })
}
const hasBody = (t: string) => ['rite', 'collect', 'text', 'reading', 'psalm', 'sermon'].includes(t)
const uid = useId()
</script>

<template>
  <div>
    <div
      v-for="(b, i) in model"
      :key="b.key"
      class="block-editor"
      :class="{ 'block-editor--loc': b.textSource === 'loc_manual' }"
    >
      <div class="block-editor__head">
        <span class="block-editor__type">{{ BLOCK_TYPE_LABEL[b.type] ?? b.type }}</span>
        <label
          class="sr-only"
          :for="`${uid}-t-${i}`"
        >Título do bloco</label>
        <input
          :id="`${uid}-t-${i}`"
          class="input"
          style="min-height:2.3rem;padding:.3rem .55rem;font-weight:700;flex:1"
          :value="b.title"
          @input="update(i, { title: ($event.target as HTMLInputElement).value })"
        >
        <button
          type="button"
          class="btn btn--icon btn--small"
          :disabled="i === 0"
          :aria-label="`Subir ${b.title}`"
          @click="move(i, -1)"
        >
          <Icon name="up" />
        </button>
        <button
          type="button"
          class="btn btn--icon btn--small"
          :disabled="i === model.length - 1"
          :aria-label="`Descer ${b.title}`"
          @click="move(i, 1)"
        >
          <Icon name="down" />
        </button>
        <button
          type="button"
          class="btn btn--icon btn--small btn--no"
          :aria-label="`Remover ${b.title}`"
          @click="remove(i)"
        >
          <Icon name="trash" />
        </button>
      </div>
      <div class="block-editor__body">
        <div class="fields-2">
          <label class="field">
            <span class="field__label">Responsável (pela escala)</span>
            <select
              class="select"
              :value="b.dutyId ?? ''"
              @change="update(i, { dutyId: ($event.target as HTMLSelectElement).value || null })"
            >
              <option value="">Ninguém</option>
              <option
                v-for="d in duties"
                :key="d.id"
                :value="d.id"
              >{{ d.name }}</option>
            </select>
          </label>
          <label
            v-if="mode === 'script' && people"
            class="field"
          >
            <span class="field__label">Pessoa específica</span>
            <select
              class="select"
              :value="b.personId ?? ''"
              @change="update(i, { personId: ($event.target as HTMLSelectElement).value || null })"
            >
              <option value="">Quem estiver escalado na função</option>
              <option
                v-for="p in people"
                :key="p.id"
                :value="p.id"
              >{{ p.displayName }}</option>
            </select>
          </label>
        </div>
        <p
          v-if="mode === 'script' && b.responsibles"
          class="small"
          style="margin-top:.4rem"
        >
          <template v-if="b.responsibles.length">
            <strong>No roteiro:</strong>
            <template
              v-for="(r, k) in b.responsibles"
              :key="k"
            >
              {{ r.name }} <StatusMark
                :status="r.status"
                short
              /><template v-if="k < b.responsibles.length - 1">
                ,
              </template>
            </template>
          </template>
          <span
            v-else-if="b.dutyId || b.personId"
            style="color:var(--wait)"
          >Ninguém escalado nesta função ainda.</span>
        </p>

        <label
          v-if="b.type === 'reading' || b.type === 'psalm'"
          class="field"
          style="margin-top:.9rem"
        >
          <span class="field__label">Referência</span>
          <input
            class="input"
            :value="b.data.reference ?? ''"
            placeholder="Ex.: Mt 25.1-13"
            @input="updateData(i, { reference: ($event.target as HTMLInputElement).value, source: 'manual' })"
          >
          <span
            v-if="b.data.source === 'estevao'"
            class="field__hint"
          >Sugerida pelo Estêvão.</span>
        </label>

        <template v-if="hasBody(b.type)">
          <label
            class="field"
            style="margin-top:.9rem"
          >
            <span class="field__label">{{ b.type === 'reading' || b.type === 'psalm' ? 'Texto (opcional)' : b.type === 'sermon' ? 'Tema ou observação' : 'Texto' }}</span>
            <textarea
              class="textarea textarea--tall"
              :value="b.body ?? ''"
              :style="b.type === 'reading' || b.type === 'psalm' || b.type === 'sermon' ? 'min-height:5rem' : ''"
              @input="update(i, { body: ($event.target as HTMLTextAreaElement).value || null })"
            />
          </label>
          <div
            class="row"
            style="margin-top:.5rem"
          >
            <label
              class="small"
              :for="`${uid}-s-${i}`"
            >Origem do texto</label>
            <select
              :id="`${uid}-s-${i}`"
              class="select"
              style="width:auto;min-height:2.2rem;padding:.2rem .5rem"
              :value="b.textSource"
              @change="update(i, { textSource: ($event.target as HTMLSelectElement).value })"
            >
              <option
                v-for="(l, k) in TEXT_SOURCE_LABEL"
                :key="k"
                :value="k"
              >
                {{ l }}
              </option>
            </select>
          </div>
          <p
            v-if="b.textSource === 'loc_manual'"
            class="small"
            style="margin-top:.35rem;color:var(--wait)"
          >
            Texto do LOC: uso da própria igreja. Não compartilhe com outras comunidades sem confirmar os direitos.
          </p>
        </template>

        <div
          v-if="b.type === 'music'"
          class="small ink-2"
          style="margin-top:.75rem"
        >
          <template v-if="mode === 'script'">
            {{ b.songs?.length ? b.songs.map((s) => s.title).join(' · ') : 'Nenhuma música escolhida.' }} As músicas são escolhidas na seção “Músicas”.
          </template>
          <template v-else>
            As músicas de cada culto são escolhidas por quem prega (ou pelos pastores).
          </template>
        </div>

        <div
          v-if="b.type === 'announcements'"
          style="margin-top:.75rem"
        >
          <p class="field__label">
            Avisos
          </p>
          <div
            v-for="(it, k) in b.data.items ?? []"
            :key="k"
            class="row"
            style="margin-top:.5rem;align-items:flex-start"
          >
            <label
              class="sr-only"
              :for="`${uid}-a-${i}-${k}`"
            >Aviso</label>
            <input
              :id="`${uid}-a-${i}-${k}`"
              class="input"
              style="flex:2;min-width:12rem"
              :value="it.text"
              placeholder="Texto do aviso"
              @input="updateItem(i, k, { text: ($event.target as HTMLInputElement).value })"
            >
            <select
              v-if="people"
              class="select"
              style="flex:1;min-width:9rem"
              aria-label="Quem trouxe o aviso"
              :value="it.ownerPersonId ?? ''"
              @change="updateItem(i, k, { ownerPersonId: ($event.target as HTMLSelectElement).value || null })"
            >
              <option value="">
                Responsável
              </option>
              <option
                v-for="p in people"
                :key="p.id"
                :value="p.id"
              >
                {{ p.displayName }}
              </option>
            </select>
            <label
              class="check"
              style="padding:.6rem 0"
            ><input
              type="checkbox"
              :checked="it.status === 'ready'"
              @change="updateItem(i, k, { status: ($event.target as HTMLInputElement).checked ? 'ready' : 'draft' })"
            ><span class="small">pronto</span></label>
            <button
              type="button"
              class="btn btn--icon btn--small btn--no"
              aria-label="Remover aviso"
              @click="removeItem(i, k)"
            >
              <Icon name="x" />
            </button>
          </div>
          <button
            type="button"
            class="btn btn--quiet btn--small"
            style="margin-top:.4rem"
            @click="addItem(i)"
          >
            <Icon name="plus" /> Aviso
          </button>
        </div>
      </div>
    </div>
    <div
      class="row"
      style="margin-top:1rem"
    >
      <label
        class="sr-only"
        :for="`${uid}-add`"
      >Tipo do novo bloco</label>
      <select
        :id="`${uid}-add`"
        v-model="addType"
        class="select"
        style="width:auto"
      >
        <option
          v-for="t in TYPES"
          :key="t"
          :value="t"
        >
          {{ BLOCK_TYPE_LABEL[t] }}
        </option>
      </select>
      <button
        type="button"
        class="btn"
        @click="add"
      >
        <Icon name="plus" /> Adicionar bloco
      </button>
    </div>
  </div>
</template>
