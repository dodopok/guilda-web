<script setup lang="ts">
import type { Duty } from '~/types'

useHead({ title: 'Editar modelo' })
const route = useRoute()
const id = String(route.params.id)
const { capi, link } = useChurch()
const toast = useToast()

interface RawBlock { id: string, type: string, title: string, body: string | null, textSource: string, dutyId: string | null }
interface TemplateFull { id: string, name: string, kind: string, description: string | null, blocks: RawBlock[] }
const { data, refresh } = await useAsyncData(`template-${id}`, async () => {
  const [t, c] = await Promise.all([capi<{ template: TemplateFull }>(`/templates/${id}`), capi<{ duties: Duty[] }>('/catalog')])
  return { template: t.template, duties: c.duties.filter((d) => d.active) }
})

// O modelo na tela: um item por bloco que a coordenação enxerga. "Leituras do dia" é um
// item só, guardado como uma leitura por posição marcada (1ª, salmo, 2ª, evangelho).
interface Item { key: string, kind: TemplateKindKey, title: string, body: string, loc: boolean, dutyId: string | null, slots: string[] }
const form = reactive({ name: '', kind: 'regular' })
const items = ref<Item[]>([])
const baseline = ref('')
const openKey = ref<string | null>(null)
let seq = 0
const newKey = () => `i${++seq}`

function slotOf(title: string) {
  const t = title.toLowerCase()
  if (t.includes('salmo')) return 'psalm'
  if (t.includes('evangel')) return 'gospel'
  if (t.includes('segunda') || t.includes('2ª') || t.includes('epístola')) return 'second_reading'
  return 'first_reading'
}
function fromBlocks(blocks: RawBlock[]): Item[] {
  const out: Item[] = []
  for (const b of blocks) {
    if (b.type === 'reading' || b.type === 'psalm') {
      const last = out.at(-1)
      const slot = slotOf(b.title)
      if (last?.kind === 'readings') {
        if (!last.slots.includes(slot)) last.slots.push(slot)
      } else {
        out.push({ key: newKey(), kind: 'readings', title: 'Leituras do dia', body: '', loc: false, dutyId: b.dutyId, slots: [slot] })
      }
      continue
    }
    const kind: TemplateKindKey = b.type === 'heading' ? (b.textSource === 'estevao' ? 'sunday' : 'heading') : (b.type as TemplateKindKey)
    out.push({ key: newKey(), kind: kind in BLOCK_KINDS ? kind : 'text', title: b.title, body: b.body ?? '', loc: b.textSource === 'loc_manual', dutyId: b.dutyId, slots: [] })
  }
  return out
}
interface TplBlock { type: string, title: string, body: string | null, textSource: string, dutyId: string | null }
function toBlocks(list: Item[]) {
  return list.flatMap((it): TplBlock[] => {
    const title = it.title.trim() || BLOCK_KINDS[it.kind].label
    switch (it.kind) {
      case 'heading': return [{ type: 'heading', title, body: null, textSource: 'church', dutyId: null }]
      case 'sunday': return [{ type: 'heading', title: 'Nome do domingo', body: null, textSource: 'estevao', dutyId: null }]
      case 'rite':
      case 'text': return [{ type: it.kind, title, body: it.body.trim() || null, textSource: it.loc ? 'loc_manual' : 'church', dutyId: it.dutyId }]
      case 'collect': return [{ type: 'collect', title, body: null, textSource: 'estevao', dutyId: it.dutyId }]
      case 'readings': return READING_SLOTS.filter((s) => it.slots.includes(s.slot)).map((s) => ({ type: s.type, title: s.title, body: null, textSource: 'estevao', dutyId: it.dutyId }))
      default: return [{ type: it.kind, title, body: null, textSource: 'church', dutyId: it.dutyId }]
    }
  })
}
const ser = () => JSON.stringify([form, toBlocks(items.value)])
watch(data, (d) => {
  const t = d?.template
  if (!t) return
  Object.assign(form, { name: t.name, kind: t.kind })
  items.value = fromBlocks(t.blocks)
  baseline.value = ser()
}, { immediate: true })
const dirty = computed(() => ser() !== baseline.value)
onBeforeRouteLeave(() => (dirty.value ? window.confirm('Sair sem salvar o modelo?') : true))

const dutyName = (dutyId: string | null) => data.value?.duties.find((d) => d.id === dutyId)?.name
const dutyOfKind = (k: string) => data.value?.duties.find((d) => d.kind === k)?.id ?? null
function subOf(it: Item) {
  const k = BLOCK_KINDS[it.kind]
  const parts = [k.estevao ? 'Vem do Estêvão' : it.loc ? 'Texto do Livro de Oração' : 'Da igreja']
  if (it.kind === 'readings') parts.push(READING_SLOTS.filter((s) => it.slots.includes(s.slot)).map((s) => s.title).join(', ') || 'nenhuma leitura marcada')
  if (k.hasDuty && dutyName(it.dutyId)) parts.push(dutyName(it.dutyId)!)
  return parts.join(' · ')
}
function move(i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= items.value.length) return
  const list = [...items.value]
  ;[list[i], list[j]] = [list[j]!, list[i]!]
  items.value = list
}
function remove(i: number) {
  items.value = items.value.filter((_, k) => k !== i)
}
function toggleSlot(it: Item, slot: string) {
  it.slots = it.slots.includes(slot) ? it.slots.filter((s) => s !== slot) : [...it.slots, slot]
}

const adding = ref(false)
const hasReadings = computed(() => items.value.some((i) => i.kind === 'readings'))
const GROUPS: { title: string, sub: string, kinds: TemplateKindKey[] }[] = [
  { title: 'Da igreja', sub: 'Texto que vocês escrevem uma vez e vale para todo culto deste modelo.', kinds: ['heading', 'rite', 'sermon', 'music', 'announcements', 'text'] },
  { title: 'Vem do Estêvão', sub: 'Preenchido a cada domingo, conforme o calendário e o lecionário.', kinds: ['sunday', 'collect', 'readings'] },
]
function add(kind: TemplateKindKey) {
  const key = newKey()
  const dutyId = kind === 'readings' ? dutyOfKind('reading') : kind === 'sermon' ? dutyOfKind('sermon') : kind === 'music' ? dutyOfKind('music') : null
  items.value = [...items.value, {
    key,
    kind,
    title: kind === 'sunday' ? 'Nome do domingo' : BLOCK_KINDS[kind].label,
    body: '',
    loc: false,
    dutyId,
    slots: kind === 'readings' ? READING_SLOTS.map((s) => s.slot) : [],
  }]
  adding.value = false
  openKey.value = key
}

// Funções da escala (na ordem do culto) viram blocos: leitura → coleta e leituras do dia,
// sermão, músicas e as demais como rito com quem faz já ligado.
// Só funções que aparecem no roteiro (apoio como café ou mídia fica só na escala).
const scaleDuties = computed(() => (data.value?.duties ?? []).filter((d) => d.includeByDefault && d.inScript).sort((a, b) => a.position - b.position))
function itemForDuty(d: Duty): Item[] {
  const base = { body: '', loc: false, dutyId: d.id, slots: [] as string[] }
  if (d.kind === 'reading') {
    const out: Item[] = []
    if (!items.value.some((i) => i.kind === 'collect')) out.push({ ...base, key: newKey(), kind: 'collect', title: BLOCK_KINDS.collect.label, dutyId: null })
    if (!items.value.some((i) => i.kind === 'readings')) out.push({ ...base, key: newKey(), kind: 'readings', title: 'Leituras do dia', slots: READING_SLOTS.map((x) => x.slot) })
    return out
  }
  if (d.kind === 'sermon') return [{ ...base, key: newKey(), kind: 'sermon', title: d.name }]
  if (d.kind === 'music') return [{ ...base, key: newKey(), kind: 'music', title: d.name }]
  if (d.name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().startsWith('aviso')) return [{ ...base, key: newKey(), kind: 'announcements', title: d.name }]
  return [{ ...base, key: newKey(), kind: 'rite', title: d.name }]
}
const outside = computed(() => scaleDuties.value.filter((d) => !items.value.some((i) => i.dutyId === d.id)))
function startFromScale() {
  items.value = [{ key: newKey(), kind: 'sunday', title: 'Nome do domingo', body: '', loc: false, dutyId: null, slots: [] }]
  for (const d of scaleDuties.value) items.value = [...items.value, ...itemForDuty(d)]
}
// Entra depois do último bloco de uma função que vem antes na escala.
function addDuty(d: Duty) {
  const pos = (id: string | null) => scaleDuties.value.find((x) => x.id === id)?.position
  let at = 0
  items.value.forEach((it, i) => {
    const p = pos(it.dutyId)
    if (p !== undefined && p <= d.position) at = i + 1
    else if (it.kind === 'sunday' || it.kind === 'heading') at = Math.max(at, i + 1)
  })
  const added = itemForDuty(d)
  if (!added.length) {
    // Leituras já estão no modelo: só liga a função a elas.
    const r = items.value.find((i) => i.kind === 'readings')
    if (r) r.dutyId = d.id
    return
  }
  const list = [...items.value]
  list.splice(at, 0, ...added)
  items.value = list
  openKey.value = added.at(-1)!.key
}

const saving = ref(false)
async function save() {
  if (form.name.trim().length < 2) {
    toast.error('Dê um nome ao modelo.')
    return
  }
  if (items.value.some((i) => i.kind === 'readings' && !i.slots.length)) {
    toast.error('Em "Leituras do dia", marque ao menos uma leitura.')
    return
  }
  saving.value = true
  try {
    await capi(`/templates/${id}`, { method: 'PATCH', body: { name: form.name, kind: form.kind, blocks: toBlocks(items.value) } })
    toast.ok('Modelo salvo. Roteiros já criados não mudam.')
    await refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div
    v-if="data"
    class="stack-md w-760"
  >
    <div>
      <BackLink
        :to="link('/coordenacao/modelos')"
        label="Modelos"
      />
      <input
        v-model="form.name"
        class="title-input"
        aria-label="Nome do modelo"
        maxlength="120"
      >
      <p class="lede">
        A ordem do culto. Toque em um bloco para editar; setas mudam a ordem.
      </p>
    </div>

    <div
      class="row"
      style="gap:6px"
      role="radiogroup"
      aria-labelledby="kind-label"
    >
      <span
        id="kind-label"
        class="strong muted"
        style="font-size:13.5px;font-weight:700;margin-right:4px"
      >Tipo de culto</span>
      <button
        v-for="(l, k) in TEMPLATE_KIND"
        :key="k"
        type="button"
        role="radio"
        class="chip"
        :aria-checked="form.kind === k"
        :aria-pressed="form.kind === k"
        @click="form.kind = k"
      >
        {{ l }}
      </button>
    </div>

    <ol
      v-if="items.length"
      class="stack-sm"
      style="list-style:none;margin:0;padding:0;gap:8px"
    >
      <li
        v-for="(it, i) in items"
        :key="it.key"
        class="card card--flush"
      >
        <div
          class="row"
          style="gap:10px;padding:10px 12px 10px 10px;flex-wrap:nowrap"
        >
          <span
            class="stack-sm"
            style="gap:3px"
          >
            <button
              type="button"
              class="arrowbtn"
              :aria-label="`Subir ${it.title}`"
              :disabled="i === 0"
              @click="move(i, -1)"
            ><Icon
              name="chevron-up"
              :weight="2.2"
            /></button>
            <button
              type="button"
              class="arrowbtn"
              :aria-label="`Descer ${it.title}`"
              :disabled="i === items.length - 1"
              @click="move(i, 1)"
            ><Icon
              name="chevron-down"
              :weight="2.2"
            /></button>
          </span>
          <button
            type="button"
            class="row"
            style="flex:1;min-width:0;gap:10px;flex-wrap:nowrap;border:0;background:transparent;padding:4px 0;text-align:left;color:inherit"
            :aria-expanded="openKey === it.key"
            @click="openKey = openKey === it.key ? null : it.key"
          >
            <span
              class="stag"
              :style="{ background: BLOCK_KINDS[it.kind].bg, color: BLOCK_KINDS[it.kind].fg, flex: 'none' }"
            >{{ BLOCK_KINDS[it.kind].label }}</span>
            <span style="flex:1;min-width:0">
              <span
                v-if="it.kind !== 'readings' && it.kind !== 'sunday'"
                class="strong"
                style="display:block"
              >{{ it.title }}</span>
              <span
                class="muted"
                style="display:block;font-size:13px"
              >{{ subOf(it) }}</span>
            </span>
            <Icon
              :name="openKey === it.key ? 'chevron-up' : 'chevron-down'"
              class="listrow__chev"
            />
          </button>
          <button
            type="button"
            class="icon-btn icon-btn--round icon-btn--sm"
            style="background:var(--surface-2);color:var(--muted)"
            :aria-label="`Tirar ${it.title}`"
            @click="remove(i)"
          >
            <Icon
              name="x"
              :weight="2.2"
            />
          </button>
        </div>

        <div
          v-if="openKey === it.key"
          class="stack-md"
          style="padding:12px 14px 14px;border-top:1px solid var(--line-2)"
        >
          <p
            v-if="BLOCK_KINDS[it.kind].estevao"
            class="soft"
            style="font-size:14px;background:#e3ebf8;color:#23467f;border-radius:12px;padding:10px 12px"
          >
            <template v-if="it.kind === 'sunday'">
              O nome da semana chega do Estêvão a cada domingo, com o Próprio no Tempo Comum (ex.: “19º Domingo no Tempo Comum (Próprio 23)”). Não precisa digitar.
            </template>
            <template v-else-if="it.kind === 'collect'">
              A coleta própria do domingo chega do Estêvão; no roteiro dá para trocar por outra do dia ou editar.
            </template>
            <template v-else>
              O Estêvão traz a referência de cada leitura marcada, conforme o lecionário da igreja. No roteiro você escolhe quem lê cada uma.
            </template>
          </p>

          <label
            v-if="it.kind !== 'sunday' && it.kind !== 'readings'"
            class="field"
          >
            <span class="field__label">Título no roteiro</span>
            <input
              v-model="it.title"
              class="input"
              maxlength="200"
            >
          </label>

          <fieldset
            v-if="it.kind === 'readings'"
            style="border:0;margin:0;padding:0"
          >
            <legend class="field__label">
              Quais leituras entram neste culto
            </legend>
            <div class="stack-sm">
              <label
                v-for="s in READING_SLOTS"
                :key="s.slot"
                class="check"
              >
                <input
                  type="checkbox"
                  :checked="it.slots.includes(s.slot)"
                  @change="toggleSlot(it, s.slot)"
                >
                <span class="check__text strong">{{ s.title }}</span>
              </label>
            </div>
            <p
              class="field__hint"
              style="margin-top:6px"
            >
              A maioria dos lecionários tem quatro, com o salmo entre a primeira e a segunda. Culto curto costuma ter só o Evangelho.
            </p>
          </fieldset>

          <template v-if="BLOCK_KINDS[it.kind].hasText">
            <label class="field">
              <span class="field__label">Texto</span>
              <textarea
                v-model="it.body"
                class="textarea"
                style="min-height:100px;resize:vertical;font-size:15.5px"
                placeholder="O que vai no roteiro de todo culto deste modelo"
              />
            </label>
            <label class="check">
              <input
                v-model="it.loc"
                type="checkbox"
              >
              <span class="check__text">
                <span class="strong">É texto do Livro de Oração (LOC)</span>
                <span
                  class="small muted"
                  style="display:block"
                >Marque quando copiar o texto do livro. Ele fica só nesta igreja e não é compartilhado com outras.</span>
              </span>
            </label>
          </template>

          <label
            v-if="BLOCK_KINDS[it.kind].hasDuty"
            class="field"
          >
            <span class="field__label">Quem faz</span>
            <select
              v-model="it.dutyId"
              class="select"
            >
              <option :value="null">Ninguém em especial</option>
              <option
                v-for="d in data.duties"
                :key="d.id"
                :value="d.id"
              >{{ d.name }}</option>
            </select>
            <span class="field__hint">A pessoa escalada nessa função aparece no roteiro.</span>
          </label>
        </div>
      </li>
    </ol>
    <div
      v-else
      class="card--dashed soft"
      style="padding:24px 20px"
    >
      <p>Este modelo ainda não tem blocos.</p>
      <button
        v-if="scaleDuties.length"
        type="button"
        class="btn btn--sm"
        style="margin-top:12px"
        @click="startFromScale"
      >
        Começar pelas funções da escala
      </button>
      <p
        v-if="scaleDuties.length"
        class="small muted"
        style="margin-top:8px"
      >
        Cria um bloco para cada função ({{ scaleDuties.map((d) => d.name).join(', ') }}), na ordem da escala, mais nome do domingo, coleta e leituras do dia. Depois é só ajustar.
      </p>
    </div>

    <div
      v-if="items.length && outside.length"
      class="tplbar tplbar--warn"
    >
      <p style="flex-basis:100%">
        <span class="strong">Funções da escala fora deste modelo.</span> Quem está escalado nelas não aparece no roteiro. Toque para acrescentar:
      </p>
      <button
        v-for="d in outside"
        :key="d.id"
        type="button"
        class="chip"
        @click="addDuty(d)"
      >
        <Icon
          name="plus"
          :weight="2.2"
          style="width:14px;height:14px"
        />{{ d.name }}
      </button>
    </div>

    <button
      type="button"
      class="btn btn--secondary btn--sm"
      style="align-self:flex-start;min-height:44px;font-size:15px"
      @click="adding = true"
    >
      <Icon
        name="plus"
        :weight="2.2"
        style="width:16px;height:16px"
      />Acrescentar bloco
    </button>

    <div class="savebar">
      <span
        v-if="dirty"
        class="small muted"
      >Alterações não salvas</span>
      <button
        type="button"
        class="btn btn--float"
        :disabled="saving"
        @click="save"
      >
        Salvar modelo
      </button>
    </div>

    <Sheet
      v-model:open="adding"
      title="Que tipo de bloco?"
    >
      <div
        v-for="g in GROUPS"
        :key="g.title"
        style="margin-top:14px"
      >
        <p class="caps">
          {{ g.title }}
        </p>
        <p
          class="small muted"
          style="margin:2px 0 8px"
        >
          {{ g.sub }}
        </p>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px">
          <button
            v-for="k in g.kinds"
            :key="k"
            type="button"
            class="suggest"
            :disabled="k === 'readings' && hasReadings"
            :title="k === 'readings' && hasReadings ? 'Este modelo já tem as leituras do dia' : undefined"
            @click="add(k)"
          >
            <span
              class="stag"
              :style="{ background: BLOCK_KINDS[k].bg, color: BLOCK_KINDS[k].fg }"
            >{{ BLOCK_KINDS[k].label }}</span>
            <span
              class="soft"
              style="font-size:13px"
            >{{ BLOCK_KINDS[k].sub }}</span>
          </button>
        </div>
      </div>
    </Sheet>
  </div>
</template>
