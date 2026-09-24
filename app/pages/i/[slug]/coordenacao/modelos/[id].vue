<script setup lang="ts">
import type { Duty } from '~/types'

useHead({ title: 'Editar modelo' })
const route = useRoute()
const id = String(route.params.id)
const { capi, link } = useChurch()
const toast = useToast()

interface RawBlock { id: string, type: string, title: string, body: string | null, textSource: string, dutyId: string | null }
interface TemplateFull { id: string, name: string, kind: string, description: string | null, blocks: RawBlock[], upcomingDrafts: number }
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
    // "Texto" antigo é o mesmo que rito/texto fixo: abre e salva como rito.
    const kind: TemplateKindKey = b.type === 'heading' ? (b.textSource === 'estevao' ? 'sunday' : 'heading') : b.type === 'text' ? 'rite' : (b.type as TemplateKindKey)
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
// Uma linha curta que diz de onde vem o conteúdo e quem faz.
const SLOT_SHORT: Record<string, string> = { first_reading: '1ª leitura', psalm: 'Salmo', second_reading: '2ª leitura', gospel: 'Evangelho' }
const nameEq = (a: string, b: string) => a.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim() === b.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
function rowTitle(it: Item) {
  return it.kind === 'readings' || it.kind === 'sunday' ? BLOCK_KINDS[it.kind].label : it.title
}
function subOf(it: Item) {
  // Função com o mesmo nome do bloco (Sermão/Sermão) vira "quem está na escala".
  const duty = BLOCK_KINDS[it.kind].hasDuty ? dutyName(it.dutyId) : undefined
  const who = duty && nameEq(duty, it.title) ? 'quem está na escala' : duty
  switch (it.kind) {
    case 'heading': return 'Título'
    case 'sunday': return 'Vem do Estêvão'
    case 'collect': return ['Vem do Estêvão', who].filter(Boolean).join(' · ')
    case 'readings': return READING_SLOTS.filter((s) => it.slots.includes(s.slot)).map((s) => SLOT_SHORT[s.slot] ?? s.title).join(', ') || 'Nenhuma leitura marcada'
    case 'rite':
    case 'text': return [it.body.trim() ? 'Texto fixo' : 'Sem texto', who].filter(Boolean).join(' · ')
    default: return who ? who.charAt(0).toUpperCase() + who.slice(1) : BLOCK_KINDS[it.kind].label
  }
}
// Reordenar: arrastar pela alça ou, no teclado, setas na alça (o foco acompanha o bloco).
const listEl = ref<HTMLElement | null>(null)
const { moveItem } = useSortableList(listEl, items)
const moved = ref('')
async function moveByKey(i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= items.value.length) return
  moveItem(i, j)
  moved.value = `${rowTitle(items.value[j]!)} agora na posição ${j + 1}.`
  await nextTick()
  listEl.value?.querySelectorAll<HTMLElement>('.drag-handle')[j]?.focus()
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
  { title: 'Da igreja', sub: 'Texto que vocês escrevem uma vez e vale para todo culto deste modelo.', kinds: ['heading', 'rite', 'sermon', 'music', 'announcements'] },
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
// Mudou a ordem e há próximos roteiros deste modelo ainda não publicados: pergunta se
// eles acompanham (o que já foi preenchido neles continua).
const askApply = ref(false)
const baselineBlocks = computed(() => JSON.stringify(data.value ? toBlocks(fromBlocks(data.value.template.blocks)) : []))
function save() {
  if (form.name.trim().length < 2) {
    toast.error('Dê um nome ao modelo.')
    return
  }
  if (items.value.some((i) => i.kind === 'readings' && !i.slots.length)) {
    toast.error('Em "Leituras do dia", marque ao menos uma leitura.')
    return
  }
  const blocksChanged = JSON.stringify(toBlocks(items.value)) !== baselineBlocks.value
  if (blocksChanged && (data.value?.template.upcomingDrafts ?? 0) > 0) askApply.value = true
  else void doSave(false)
}
async function doSave(apply: boolean) {
  askApply.value = false
  saving.value = true
  try {
    const r = await capi<{ updatedScripts: number }>(`/templates/${id}`, { method: 'PATCH', body: { name: form.name, kind: form.kind, blocks: toBlocks(items.value), applyToUpcoming: apply } })
    toast.ok(apply && r.updatedScripts ? `Modelo salvo e ${plural(r.updatedScripts, 'roteiro atualizado', 'roteiros atualizados')}.` : 'Modelo salvo.')
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
        A ordem do culto. Arraste pela alça para mudar a ordem; toque no bloco para editar.
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

    <p
      class="sr-only"
      aria-live="polite"
    >
      {{ moved }}
    </p>
    <ol
      v-if="items.length"
      ref="listEl"
      class="stack-sm"
      style="list-style:none;margin:0;padding:0;gap:8px"
    >
      <li
        v-for="(it, i) in items"
        :key="it.key"
        class="card card--flush tplrow"
        :style="{ borderLeftColor: BLOCK_KINDS[it.kind].fg === '#fff' ? BLOCK_KINDS[it.kind].bg : BLOCK_KINDS[it.kind].fg }"
      >
        <div class="tplrow__head">
          <!-- Alça: arraste com o dedo ou o mouse; no teclado, setas para cima e para baixo. -->
          <button
            type="button"
            class="drag-handle"
            :aria-label="`Mover ${rowTitle(it)} (posição ${i + 1} de ${items.length}). Arraste ou use as setas.`"
            @keydown.up.prevent="moveByKey(i, -1)"
            @keydown.down.prevent="moveByKey(i, 1)"
          >
            <Icon
              name="grip"
              :weight="3"
            />
          </button>
          <button
            type="button"
            class="tplrow__main"
            :aria-expanded="openKey === it.key"
            @click="openKey = openKey === it.key ? null : it.key"
          >
            <span style="flex:1;min-width:0">
              <span class="strong tplrow__title">{{ rowTitle(it) }}</span>
              <span class="muted tplrow__sub">{{ subOf(it) }}</span>
            </span>
            <Icon
              :name="openKey === it.key ? 'chevron-up' : 'chevron-down'"
              class="listrow__chev"
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
            <span class="field__label">Nome no roteiro</span>
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
                v-for="d in data.duties.filter((x) => x.inScript || x.id === it.dutyId)"
                :key="d.id"
                :value="d.id"
              >{{ d.name }}</option>
            </select>
            <span class="field__hint">Quem estiver escalado nessa função aparece no roteiro.</span>
          </label>

          <div
            class="row"
            style="gap:8px;padding-top:4px"
          >
            <button
              type="button"
              class="linkbtn"
              style="color:var(--danger, #b3261e)"
              @click="remove(i)"
            >
              Tirar do modelo
            </button>
          </div>
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

    <Sheet
      v-model:open="askApply"
      title="Atualizar os próximos roteiros?"
    >
      <p class="soft">
        {{ plural(data.template.upcomingDrafts, 'roteiro ainda não publicado usa', 'roteiros ainda não publicados usam') }} este modelo. Eles podem seguir a nova ordem agora — leituras, coleta, músicas, avisos e quem faz o quê continuam como estão.
      </p>
      <p
        class="small muted"
        style="margin-top:8px"
      >
        Roteiros já publicados não mudam; cada um mostra que o modelo mudou.
      </p>
      <div
        class="stack-sm"
        style="margin-top:16px"
      >
        <button
          type="button"
          class="btn btn--block"
          :disabled="saving"
          @click="doSave(true)"
        >
          Salvar e atualizar {{ plural(data.template.upcomingDrafts, 'roteiro', 'roteiros') }}
        </button>
        <button
          type="button"
          class="btn btn--secondary btn--block"
          :disabled="saving"
          @click="doSave(false)"
        >
          Salvar só o modelo
        </button>
      </div>
    </Sheet>
  </div>
</template>
