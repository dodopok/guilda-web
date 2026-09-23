<script setup lang="ts">
import type { EditableBlock, LiturgicalSuggestion, ScriptView, Song } from '~/types'

// Editor do roteiro (coordenação e pastores). Mudanças ficam locais até salvar; a
// coordenação publica, os pastores salvam para a coordenação publicar.
const props = defineProps<{
  view: ScriptView
  serviceId: string
  people: { id: string, displayName: string, dutyIds: string[], roles?: string[] }[]
  songs: Song[]
  canPublish: boolean
  isPastor: boolean
  // Pessoas escaladas neste culto por função (para sugerir quem lê).
  scheduled: Record<string, string[]>
}>()
const emit = defineEmits<{ (e: 'refresh'): void }>()
const { capi, tz, slug } = useChurch()
const exportBase = computed(() => `/api/v1/churches/${slug.value}/scripts/${props.serviceId}/export`)
const toast = useToast()

const blocks = ref<(EditableBlock & { notified?: boolean, origPerson?: string | null, origRef?: string })[]>([])
const pastoralNote = ref('')
const baseline = ref('')
function load() {
  const d = props.view.draft
  if (!d) return
  blocks.value = d.blocks.map((b) => ({ key: b.id, type: b.type, title: b.title, body: b.body, textSource: b.textSource, dutyId: b.dutyId, personId: b.personId, data: JSON.parse(JSON.stringify(b.data)), responsibles: b.responsibles, songs: b.songs, notified: b.readerNotified, origPerson: b.personId, origRef: b.data.reference }))
  pastoralNote.value = d.pastoralNote ?? ''
  baseline.value = serialize()
}
function serialize() {
  return JSON.stringify([blocks.value.map(({ type, title, body, textSource, dutyId, personId, data }) => ({ type, title, body, textSource, dutyId, personId, data })), pastoralNote.value])
}
watch(() => props.view.draft?.updatedAt, load, { immediate: true })
const dirty = computed(() => serialize() !== baseline.value)
onBeforeRouteLeave(() => {
  if (dirty.value && !window.confirm('Há alterações não salvas no roteiro. Sair mesmo assim?')) return false
})

// ------------------------------------------------------------ itens exibidos
const isReading = (b: EditableBlock) => b.type === 'reading' || b.type === 'psalm'
interface Item { key: string, kind: 'rite' | 'collect' | 'music' | 'readings' | 'sermon' | 'announcements' | 'heading', block?: EditableBlock }
const items = computed<Item[]>(() => {
  const list: Item[] = []
  let readingsPlaced = false
  for (const b of blocks.value) {
    if (isReading(b)) {
      if (!readingsPlaced) list.push({ key: 'leituras', kind: 'readings' })
      readingsPlaced = true
      continue
    }
    if (b.type === 'sermon' && !readingsPlaced) {
      list.push({ key: 'leituras', kind: 'readings' })
      readingsPlaced = true
    }
    const kind = b.type === 'rite' || b.type === 'text' ? 'rite' : b.type === 'collect' ? 'collect' : b.type === 'music' ? 'music' : b.type === 'sermon' ? 'sermon' : b.type === 'announcements' ? 'announcements' : 'heading'
    list.push({ key: b.key, kind, block: b })
  }
  if (!readingsPlaced) list.push({ key: 'leituras', kind: 'readings' })
  return list
})
const readings = computed(() => blocks.value.filter(isReading))
const whoOf = (b?: EditableBlock) => (b?.responsibles ?? []).map((r) => r.name).join(', ')
const musicBlock = computed(() => blocks.value.find((b) => b.type === 'music'))
const announcements = computed(() => blocks.value.find((b) => b.type === 'announcements'))
const readersMissing = computed(() => readings.value.filter((r) => !r.personId && r.type === 'reading').length)
const songCount = computed(() => musicBlock.value?.data.songIds?.length ?? 0)

function isAdapted(b: EditableBlock) {
  return b.data.templateBody !== undefined && b.data.templateBody !== null && (b.body ?? '') !== (b.data.templateBody ?? '')
}
function summary(it: Item) {
  const b = it.block
  switch (it.kind) {
    case 'rite': return b?.data.templateBody === undefined ? (b?.body ? 'texto do roteiro' : 'sem texto') : isAdapted(b!) ? 'texto adaptado' : 'texto padrão do modelo'
    case 'collect': return b?.body ? (b.textSource === 'estevao' ? 'do Estêvão' : 'texto manual') : 'ainda sem coleta'
    case 'music': return songCount.value ? plural(songCount.value, 'música', 'músicas') : 'escolher músicas'
    case 'readings': return readings.value.length ? (readersMissing.value ? plural(readersMissing.value, 'leitura sem leitor', 'leituras sem leitor') : 'todas com leitor') : 'sem leituras'
    case 'sermon': return b?.data.reference || 'texto base'
    case 'announcements': return plural(b?.data.items?.length ?? 0, 'aviso', 'avisos')
    default: return ''
  }
}
function ok(it: Item) {
  if (it.kind === 'music') return songCount.value > 0
  if (it.kind === 'readings') return readings.value.length > 0 && readersMissing.value === 0
  if (it.kind === 'collect') return Boolean(it.block?.body)
  return true
}
function titleOf(it: Item) {
  if (it.kind === 'readings') return 'Leituras'
  return it.block?.title ?? ''
}

const openKey = ref<string | null>(null)
const expanded = ref<Set<string>>(new Set())
function toggleOpen(key: string) {
  openKey.value = openKey.value === key ? null : key
}
function toggleExpand(key: string) {
  const s = new Set(expanded.value)
  if (s.has(key)) s.delete(key)
  else s.add(key)
  expanded.value = s
}
const todos = computed(() => [
  { key: 'leituras', label: readings.value.length ? (readersMissing.value ? `${plural(readersMissing.value, 'leitura', 'leituras')} sem leitor` : 'Leituras com leitor') : 'Acrescentar as leituras', done: readings.value.length > 0 && readersMissing.value === 0 },
  ...(musicBlock.value ? [{ key: musicBlock.value.key, label: songCount.value ? plural(songCount.value, 'música escolhida', 'músicas escolhidas') : 'Escolher as músicas', done: songCount.value > 0 }] : []),
  ...(announcements.value ? [{ key: announcements.value.key, label: `${plural(announcements.value.data.items?.length ?? 0, 'aviso', 'avisos')} para ler`, done: true }] : []),
])
const pendingTodos = computed(() => todos.value.filter((t) => !t.done).length)
const dayWord = computed(() => weekdayLong(props.view.service.startsAt, tz.value).replace('-feira', ''))

// ------------------------------------------------------------ ritos
const editingRite = ref<string | null>(null)
const riteDraft = ref('')
function startRite(b: EditableBlock) {
  editingRite.value = b.key
  riteDraft.value = b.body ?? ''
}
function saveRite(b: EditableBlock) {
  const t = riteDraft.value.trim()
  b.body = t || (b.data.templateBody ?? null)
  editingRite.value = null
  const s = new Set(expanded.value)
  s.add(b.key)
  expanded.value = s
  toast.ok(isAdapted(b) ? 'Texto adaptado só para este culto.' : 'Texto igual ao padrão do modelo.')
}
function resetRite(b: EditableBlock) {
  b.body = b.data.templateBody ?? null
  toast.ok('Voltou ao texto padrão do modelo.')
}

// ------------------------------------------------------------ leituras
const readingPool = computed(() => {
  const dutyId = readings.value.find((r) => r.dutyId)?.dutyId ?? null
  const scheduled = new Set(dutyId ? props.scheduled[dutyId] ?? [] : [])
  const qualified = props.people.filter((p) => (dutyId && p.dutyIds.includes(dutyId)) || scheduled.has(p.id))
  const list = qualified.map((p) => ({ id: p.id, name: p.displayName, scheduled: scheduled.has(p.id) }))
  return list.sort((a, b) => Number(b.scheduled) - Number(a.scheduled) || a.name.localeCompare(b.name, 'pt-BR'))
})
function optionsFor(r: EditableBlock) {
  const pool = [...readingPool.value]
  if (r.personId && !pool.some((p) => p.id === r.personId)) {
    const p = props.people.find((x) => x.id === r.personId)
    if (p) pool.unshift({ id: p.id, name: p.displayName, scheduled: false })
  }
  return pool
}
function setReader(r: EditableBlock, pid: string) {
  r.personId = r.personId === pid ? null : pid
}
function useAlternative(r: EditableBlock) {
  const alts = r.data.alternatives ?? []
  if (!alts.length || !r.data.reference) return
  r.data = { ...r.data, reference: alts[0], alternatives: [...alts.slice(1), r.data.reference] }
}
function removeReading(r: EditableBlock) {
  blocks.value = blocks.value.filter((b) => b !== r)
}
function addReading() {
  const readingDuty = readings.value.find((r) => r.dutyId)?.dutyId ?? null
  const at = (() => {
    const last = blocks.value.map((b, i) => (isReading(b) ? i : -1)).filter((i) => i >= 0).pop()
    if (last !== undefined) return last + 1
    const sermon = blocks.value.findIndex((b) => b.type === 'sermon')
    return sermon >= 0 ? sermon : blocks.value.length
  })()
  blocks.value.splice(at, 0, { key: `new-${Date.now()}`, type: 'reading', title: 'Leitura', body: null, textSource: 'church', dutyId: readingDuty, personId: null, data: { reference: '', source: 'manual' } })
}
const nameOf = (id: string | null) => props.people.find((p) => p.id === id)?.displayName.split(' ')[0] ?? ''
async function notifyReader(r: EditableBlock) {
  const index = readings.value.indexOf(r)
  if (dirty.value) {
    const saved = await persist()
    if (!saved) return
  }
  const fresh = props.view.draft?.blocks.filter((b) => b.type === 'reading' || b.type === 'psalm')[index]
  if (!fresh) return
  try {
    const res = await capi<{ status: string, blockedReason: string | null }>(`/scripts/${props.serviceId}/blocks/${fresh.id}/notify`, { method: 'POST' })
    if (res.status === 'blocked') toast.error(`Mensagem não enviada: ${res.blockedReason === 'no_consent' ? 'a pessoa não autorizou o WhatsApp' : res.blockedReason === 'no_phone' ? 'sem telefone cadastrado' : 'canal de WhatsApp indisponível'}.`)
    else toast.ok(`${nameOf(fresh.personId)} avisado(a) pelo WhatsApp: ${fresh.title}, ${fresh.data.reference}.`)
    emit('refresh')
  } catch (e) {
    toast.error(e)
  }
}

// ------------------------------------------------------------ avisos
const newAviso = ref('')
function addAviso() {
  const b = announcements.value
  const t = newAviso.value.trim()
  if (!b || !t) return
  b.data = { ...b.data, items: [...(b.data.items ?? []), { text: t, fixed: false, status: 'ready' }] }
  newAviso.value = ''
}
function toggleFixed(i: number) {
  const b = announcements.value!
  const items = [...(b.data.items ?? [])]
  items[i] = { ...items[i]!, fixed: !items[i]!.fixed }
  b.data = { ...b.data, items }
}
function removeAviso(i: number) {
  const b = announcements.value!
  b.data = { ...b.data, items: (b.data.items ?? []).filter((_, k) => k !== i) }
}

// ------------------------------------------------------------ músicas
const songIds = computed({
  get: () => musicBlock.value?.data.songIds ?? [],
  set: (v) => {
    if (musicBlock.value) musicBlock.value.data = { ...musicBlock.value.data, songIds: v }
  },
})
async function saveSongs() {
  if (dirty.value && !(await persist())) return
  try {
    const r = await capi<{ recipients: number, queued: number, blocked: number }>(`/scripts/${props.serviceId}/music/notify`, { method: 'POST' })
    toast.ok(r.recipients ? `Músicas salvas. ${plural(r.recipients, 'pessoa do louvor recebe', 'pessoas do louvor recebem')} o aviso.` : 'Músicas salvas. Ninguém do louvor está escalado ainda.')
  } catch (e) {
    toast.error(e, 'Músicas salvas, mas o aviso ao louvor não saiu.')
  }
}

// ------------------------------------------------------------ Estêvão
type Fetch = { ok: true, snapshotId: string, fetchedAt: string, suggestion: LiturgicalSuggestion } | { ok: false, error: { kind: string, message: string }, cached: { snapshotId: string, fetchedAt: string, suggestion: LiturgicalSuggestion } | null }
const collectSheet = ref(false)
const est = ref<{ snapshotId: string, suggestion: LiturgicalSuggestion } | null>(null)
const estLoading = ref(false)
async function fetchEstevao() {
  estLoading.value = true
  try {
    const r = await capi<Fetch>(`/scripts/${props.serviceId}/liturgical-data`)
    if (r.ok) est.value = { snapshotId: r.snapshotId, suggestion: r.suggestion }
    else if (r.cached) {
      est.value = { snapshotId: r.cached.snapshotId, suggestion: r.cached.suggestion }
      toast.error(`${r.error.message} Usando os dados guardados em ${dateTime(r.cached.fetchedAt, tz.value)}.`)
    } else {
      est.value = null
      toast.error(`${r.error.message} Preencha à mão.`)
    }
  } catch (e) {
    toast.error(e)
  } finally {
    estLoading.value = false
  }
  return est.value
}
async function applyEstevao(body: Record<string, unknown>) {
  if (dirty.value && !(await persist())) return
  try {
    await capi(`/scripts/${props.serviceId}/liturgical-data/apply`, { method: 'POST', body })
    emit('refresh')
  } catch (e) {
    toast.error(e)
  }
}
async function fillReadings() {
  const e = await fetchEstevao()
  if (!e) return
  const chosen = e.suggestion.readings.filter((r) => r.key !== 'psalm_alternative').map((r) => ({ key: r.key, reference: r.reference, label: r.label, alternatives: r.alternatives }))
  const hasCollect = Boolean(blocks.value.find((b) => b.type === 'collect')?.body)
  await applyEstevao({ snapshotId: e.snapshotId, collectIndex: hasCollect || !e.suggestion.collects.length ? null : 0, readings: chosen, replaceReadings: true, applyCalendar: true })
  toast.ok('Leituras do Estêvão no roteiro. Toque em quem lê.')
}
async function openCollects() {
  const e = await fetchEstevao()
  if (e) collectSheet.value = true
}
async function chooseCollect(index: number) {
  if (!est.value) return
  collectSheet.value = false
  await applyEstevao({ snapshotId: est.value.snapshotId, collectIndex: index, readings: [], replaceReadings: false, applyCalendar: true })
  toast.ok('Coleta atualizada do Estêvão.')
}

// ------------------------------------------------------------ salvar e publicar
const busy = ref(false)
async function persist() {
  busy.value = true
  try {
    await capi(`/scripts/${props.serviceId}/blocks`, {
      method: 'PUT',
      body: { blocks: blocks.value.map((b) => ({ type: b.type, title: b.title, body: b.body, textSource: b.textSource, dutyId: b.dutyId, personId: b.personId, data: { ...b.data, items: b.data.items?.filter((it) => it.text.trim()) } })) },
    })
    if (props.isPastor && !props.canPublish && pastoralNote.value !== (props.view.draft?.pastoralNote ?? '')) {
      await capi(`/scripts/${props.serviceId}`, { method: 'PATCH', body: { pastoralNote: pastoralNote.value || null } })
    }
    baseline.value = serialize()
    emit('refresh')
    return true
  } catch (e) {
    toast.error(e)
    return false
  } finally {
    busy.value = false
  }
}
async function save() {
  if (!(await persist())) return
  if (!props.canPublish) {
    toast.ok('Roteiro salvo. A coordenação vê suas alterações para publicar.')
    return
  }
  busy.value = true
  try {
    const r = await capi<{ version: number }>(`/scripts/${props.serviceId}/publish`, { method: 'POST' })
    toast.ok(`Roteiro publicado (versão ${r.version}). Já está no app de todos.`)
    emit('refresh')
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}
// Quem prega: pastores em destaque; outra pessoa exige confirmação da coordenação.
const pastors = computed(() => props.people.filter((p) => p.roles?.includes('pastor')))
const nonPastors = computed(() => props.people.filter((p) => !p.roles?.includes('pastor')))
const isPastorId = (id: string | null) => Boolean(id && pastors.value.some((p) => p.id === id))
const fullName = (id: string | null) => props.people.find((p) => p.id === id)?.displayName ?? ''
async function saveDraft() {
  if (await persist()) toast.ok('Rascunho salvo.')
}
</script>

<template>
  <div class="stack-md">
    <div class="panel--accent">
      <svg
        viewBox="0 0 120 120"
        aria-hidden="true"
        class="rings"
        style="right:-30px;top:-34px;opacity:.25"
      ><circle
        cx="60"
        cy="40"
        r="26"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
      /><circle
        cx="42"
        cy="72"
        r="26"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
      /><circle
        cx="78"
        cy="72"
        r="26"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
      /></svg>
      <h2
        class="h3"
        style="position:relative"
      >
        {{ pendingTodos ? `Falta ${pendingTodos === 1 ? '1 coisa' : `${pendingTodos} coisas`} para ${dayWord}` : `Tudo pronto para ${dayWord}` }}
      </h2>
      <div
        class="stack-sm"
        style="gap:6px;margin-top:12px;position:relative"
      >
        <button
          v-for="t in todos"
          :key="t.key"
          type="button"
          class="todo"
          @click="openKey = t.key"
        >
          <span
            v-if="t.done"
            class="todo__done"
          ><Icon
            name="check"
            :weight="2.6"
          /></span>
          <span
            v-else
            class="todo__open"
          />
          <span class="grow">{{ t.label }}</span>
          <Icon
            name="chevron-right"
            :weight="2.2"
            style="width:18px;height:18px;opacity:.8"
          />
        </button>
      </div>
    </div>

    <ol
      class="stack-sm"
      style="list-style:none;margin:0;padding:0"
    >
      <li
        v-for="it in items"
        :key="it.key"
        class="card card--flush"
      >
        <button
          type="button"
          class="blockhead"
          :aria-expanded="openKey === it.key"
          @click="toggleOpen(it.key)"
        >
          <span
            class="dot"
            style="width:10px;height:10px"
            :style="{ background: ok(it) ? 'var(--ok)' : '#e0a100' }"
          />
          <span class="grow"><span
            style="display:block;font-weight:800;font-size:16px"
          >{{ titleOf(it) }}</span><span
            class="muted"
            style="display:block;font-size:13.5px"
          >{{ summary(it) }}</span></span>
          <span
            v-if="whoOf(it.block)"
            style="font-size:13.5px;font-weight:700;color:var(--accent-deep)"
          >{{ whoOf(it.block) }}</span>
          <Icon
            :name="openKey === it.key ? 'chevron-up' : 'chevron-down'"
            :weight="2"
            style="width:18px;height:18px;flex:none"
            :style="{ color: openKey === it.key ? 'var(--ink-2)' : 'var(--faint)' }"
          />
        </button>

        <div
          v-if="openKey === it.key"
          style="padding:0 18px 16px"
        >
          <!-- Rito -->
          <template v-if="it.kind === 'rite' && it.block">
            <template v-if="editingRite !== it.block.key">
              <p
                v-if="it.block.body"
                class="prose"
                :class="{ clamp3: !expanded.has(it.block.key) }"
                style="margin-top:8px"
              >
                {{ it.block.body }}
              </p>
              <p
                v-else
                class="soft small"
                style="margin-top:8px"
              >
                Sem texto neste rito. O texto padrão vem do modelo de liturgia da igreja.
              </p>
              <div
                class="row"
                style="gap:6px 14px;margin-top:8px"
              >
                <button
                  v-if="it.block.body"
                  type="button"
                  class="link link--ink"
                  @click="toggleExpand(it.block.key)"
                >
                  {{ expanded.has(it.block.key) ? 'Ver menos' : 'Ver texto completo' }}
                </button>
                <template v-if="isAdapted(it.block)">
                  <span class="tag tag--info">adaptado só neste culto</span>
                  <button
                    type="button"
                    class="link link--muted"
                    @click="resetRite(it.block)"
                  >
                    Voltar ao padrão
                  </button>
                </template>
                <button
                  type="button"
                  class="link"
                  @click="startRite(it.block)"
                >
                  Adaptar neste culto
                </button>
              </div>
            </template>
            <template v-else>
              <label
                class="sr-only"
                :for="`rite-${it.block.key}`"
              >Texto de {{ it.block.title }} neste culto</label>
              <textarea
                :id="`rite-${it.block.key}`"
                v-model="riteDraft"
                class="textarea"
                style="min-height:120px;margin-top:10px;font-size:15.5px"
                placeholder="Cole ou escreva o texto deste rito só para este culto. Deixe vazio para voltar ao padrão do modelo."
              />
              <div
                class="row"
                style="gap:8px;margin-top:10px"
              >
                <button
                  type="button"
                  class="btn btn--sm"
                  style="min-height:42px"
                  @click="saveRite(it.block)"
                >
                  Salvar texto
                </button>
                <button
                  type="button"
                  class="btn btn--line btn--xs"
                  style="min-height:42px"
                  @click="editingRite = null"
                >
                  Cancelar
                </button>
              </div>
            </template>
          </template>

          <!-- Coleta -->
          <template v-else-if="it.kind === 'collect' && it.block">
            <p
              v-if="it.block.body"
              class="prose"
              :class="{ clamp3: !expanded.has(it.block.key) }"
              style="margin-top:8px"
            >
              {{ it.block.body }}
            </p>
            <textarea
              v-else
              v-model="it.block.body"
              class="textarea"
              style="margin-top:10px;font-size:15.5px"
              :aria-label="`Texto de ${it.block.title}`"
              placeholder="Sem coleta ainda. Busque no Estêvão ou escreva aqui."
            />
            <div
              class="row"
              style="gap:6px 14px;margin-top:8px"
            >
              <span
                v-if="it.block.body"
                class="tag"
              >{{ it.block.textSource === 'estevao' ? 'do Estêvão' : 'texto manual' }}</span>
              <button
                v-if="it.block.body"
                type="button"
                class="link link--ink"
                @click="toggleExpand(it.block.key)"
              >
                {{ expanded.has(it.block.key) ? 'Ver menos' : 'Ver texto completo' }}
              </button>
              <button
                v-if="canPublish"
                type="button"
                class="link"
                :disabled="estLoading"
                @click="openCollects"
              >
                {{ it.block.body ? 'Ver outras coletas do dia' : 'Buscar a coleta do dia' }}
              </button>
            </div>
          </template>

          <!-- Músicas -->
          <template v-else-if="it.kind === 'music'">
            <SongPicker
              v-model="songIds"
              :songs="songs"
            />
            <button
              type="button"
              class="btn btn--soft btn--xs"
              style="margin-top:12px;min-height:42px;padding:8px 16px"
              :disabled="busy || !songIds.length"
              @click="saveSongs"
            >
              Salvar músicas e avisar o louvor
            </button>
          </template>

          <!-- Leituras -->
          <template v-else-if="it.kind === 'readings'">
            <p
              class="soft small"
              style="margin:4px 0 12px"
            >
              {{ readings.length ? 'Toque em quem lê. Escalados aparecem primeiro.' : 'Ainda sem leituras neste roteiro.' }}
            </p>
            <div class="stack-sm">
              <div
                v-for="r in readings"
                :key="r.key"
                style="border:1px solid #eceae4;border-radius:16px;padding:12px 14px"
              >
                <div class="row">
                  <span
                    class="strong"
                    style="min-width:120px"
                  >{{ r.title }}</span>
                  <span
                    v-if="r.data.source === 'estevao' && r.data.reference"
                    class="grow"
                    style="font-size:15px;color:var(--ink-2)"
                  >{{ r.data.reference }}</span>
                  <input
                    v-else
                    v-model="r.data.reference"
                    class="input input--sm grow"
                    style="min-width:160px;min-height:40px;border-radius:10px"
                    :aria-label="`Referência de ${r.title}`"
                    placeholder="Referência, ex.: Isaías 55.1-9"
                  >
                  <button
                    v-if="r.data.alternatives?.length"
                    type="button"
                    class="link"
                    style="font-size:13px"
                    :title="`Alternativa: ${r.data.alternatives[0]}`"
                    @click="useAlternative(r)"
                  >
                    Usar alternativa
                  </button>
                  <button
                    type="button"
                    class="icon-btn icon-btn--sm"
                    :aria-label="`Tirar ${r.title}`"
                    @click="removeReading(r)"
                  >
                    <Icon
                      name="x"
                      :weight="2.2"
                    />
                  </button>
                </div>
                <div
                  v-if="r.type === 'reading'"
                  class="row"
                  style="gap:6px;margin-top:10px"
                  role="group"
                  :aria-label="`Quem lê ${r.title}`"
                >
                  <span
                    class="xsmall muted strong"
                    style="margin-right:4px"
                  >Quem lê?</span>
                  <button
                    v-for="o in optionsFor(r)"
                    :key="o.id"
                    type="button"
                    class="chip chip--person"
                    :class="{ 'chip--scheduled': o.scheduled }"
                    :aria-pressed="r.personId === o.id"
                    @click="setReader(r, o.id)"
                  >
                    <span class="av">{{ initials(o.name) }}</span>{{ o.name }}<Icon
                      v-if="r.personId === o.id"
                      name="check"
                      :weight="2.4"
                    />
                  </button>
                  <span
                    v-if="!optionsFor(r).length"
                    class="xsmall muted"
                  >Ninguém habilitado para leitura.</span>
                </div>
                <template v-if="r.type === 'reading'">
                  <p
                    v-if="r.personId && r.notified && r.personId === r.origPerson && r.data.reference === r.origRef"
                    class="xsmall strong row"
                    style="gap:6px;margin-top:10px;color:var(--ok-ink)"
                  >
                    <Icon
                      name="check"
                      :weight="2.4"
                      style="width:14px;height:14px"
                    />{{ nameOf(r.personId) }} recebeu a referência pelo WhatsApp.
                  </p>
                  <div
                    v-else-if="r.personId && r.data.reference"
                    class="row"
                    style="margin-top:10px"
                  >
                    <p
                      class="soft grow"
                      style="font-size:13.5px;min-width:160px"
                    >
                      <strong>{{ nameOf(r.personId) }}</strong> ainda não sabe desta leitura.
                    </p>
                    <button
                      type="button"
                      class="btn btn--soft btn--xs"
                      :disabled="busy"
                      @click="notifyReader(r)"
                    >
                      Avisar {{ nameOf(r.personId) }} pelo WhatsApp
                    </button>
                  </div>
                  <p
                    v-else-if="!r.personId"
                    class="xsmall strong"
                    style="margin-top:10px;color:var(--wait)"
                  >
                    Sem leitor ainda — escolha alguém acima.
                  </p>
                </template>
              </div>
            </div>
            <div
              class="row"
              style="gap:6px 16px;margin-top:10px"
            >
              <button
                type="button"
                class="link"
                @click="addReading"
              >
                <Icon
                  name="plus"
                  :weight="2.2"
                />Acrescentar outra leitura
              </button>
              <button
                v-if="canPublish"
                type="button"
                class="link"
                :disabled="estLoading"
                @click="fillReadings"
              >
                <Icon
                  name="download"
                  :weight="2"
                />{{ readings.length ? 'Trocar pelas leituras do Estêvão' : 'Buscar leituras do dia no Estêvão' }}
              </button>
            </div>
          </template>

          <!-- Sermão -->
          <template v-else-if="it.kind === 'sermon' && it.block">
            <div style="margin-top:10px">
              <span
                :id="`preacher-${it.key}`"
                class="field__label"
              >Quem prega?</span>
              <div
                class="row"
                style="gap:6px"
                role="group"
                :aria-labelledby="`preacher-${it.key}`"
              >
                <button
                  v-for="p in pastors"
                  :key="p.id"
                  type="button"
                  class="chip chip--person"
                  :aria-pressed="it.block.personId === p.id"
                  @click="it.block.personId = it.block.personId === p.id ? null : p.id"
                >
                  <span class="av">{{ initials(p.displayName) }}</span>{{ p.displayName }}
                </button>
                <select
                  class="chip"
                  style="padding:4px 10px;cursor:pointer"
                  :style="it.block.personId && !isPastorId(it.block.personId) ? 'background:var(--accent);color:var(--accent-ink);border-color:var(--accent)' : ''"
                  :value="it.block.personId && !isPastorId(it.block.personId) ? it.block.personId : ''"
                  aria-label="Outra pessoa prega"
                  @change="it.block.personId = ($event.target as HTMLSelectElement).value || null"
                >
                  <option value="">
                    Outra pessoa…
                  </option>
                  <option
                    v-for="p in nonPastors"
                    :key="p.id"
                    :value="p.id"
                  >
                    {{ p.displayName }}
                  </option>
                </select>
              </div>
              <p
                v-if="it.block.personId && !isPastorId(it.block.personId)"
                style="margin-top:8px;font-size:13.5px;color:#a86400;font-weight:700"
              >
                {{ fullName(it.block.personId) }} não é pastor(a): a coordenação confirma antes de publicar.
              </p>
            </div>
            <label
              class="field"
              style="margin-top:10px"
            >
              <span class="field__label">Texto base <span class="field__opt">(pode ser diferente das leituras)</span></span>
              <input
                v-model="it.block.data.reference"
                class="input"
                style="min-height:46px;font-size:15.5px"
              >
            </label>
          </template>

          <!-- Avisos -->
          <template v-else-if="it.kind === 'announcements' && it.block">
            <p
              class="soft small"
              style="margin:4px 0 10px"
            >
              Toque na etiqueta para alternar “todo domingo” e “só agora”.
            </p>
            <div
              class="stack-sm"
              style="gap:6px"
            >
              <div
                v-for="(a, i) in it.block.data.items ?? []"
                :key="i"
                class="row"
                style="flex-wrap:nowrap;align-items:flex-start;padding:10px 12px;border-radius:12px;background:var(--surface-3)"
              >
                <span
                  class="grow"
                  style="font-size:15px;line-height:1.45"
                >{{ a.text }}</span>
                <button
                  type="button"
                  class="tag"
                  :class="a.fixed ? '' : 'tag--info'"
                  style="border:0;padding:3px 9px"
                  :aria-label="a.fixed ? 'Aviso de todo domingo; tocar para marcar como só agora' : 'Aviso só agora; tocar para marcar como todo domingo'"
                  @click="toggleFixed(i)"
                >
                  {{ a.fixed ? 'todo domingo' : 'só agora' }}
                </button>
                <button
                  type="button"
                  class="icon-btn icon-btn--sm"
                  style="background:#fff;width:28px;height:28px"
                  aria-label="Tirar aviso"
                  @click="removeAviso(i)"
                >
                  <Icon
                    name="x"
                    :weight="2.2"
                  />
                </button>
              </div>
            </div>
            <form
              class="row"
              style="gap:8px;margin-top:10px"
              @submit.prevent="addAviso"
            >
              <input
                v-model="newAviso"
                class="input"
                style="flex:1 1 220px;width:auto;min-height:46px;font-size:15.5px"
                aria-label="Novo aviso"
                placeholder="Novo aviso, ex.: Retiro de jovens, 7 de novembro"
              >
              <button
                class="btn btn--dark btn--sm"
                style="min-height:46px"
              >
                Adicionar
              </button>
            </form>
          </template>

          <p
            v-else-if="it.block?.body"
            class="prose"
            style="margin-top:8px"
          >
            {{ it.block.body }}
          </p>
        </div>
      </li>
    </ol>

    <div
      v-if="isPastor && !canPublish"
      class="card"
    >
      <h3 style="font-size:17px">
        Observação para a coordenação
      </h3>
      <p
        class="soft small"
        style="margin:2px 0 8px"
      >
        Revisão informal: não bloqueia a publicação.
      </p>
      <textarea
        v-model="pastoralNote"
        class="textarea"
        style="min-height:80px;font-size:15.5px"
        aria-label="Observação para a coordenação"
        placeholder="Ex.: trocar a ordem do credo e dos avisos neste domingo"
      />
    </div>
    <div
      v-else-if="view.draft?.pastoralNote"
      class="panel panel--soft"
    >
      <p class="strong small">
        Observação da pastoral
      </p>
      <p style="margin-top:4px;white-space:pre-line">
        {{ view.draft.pastoralNote }}
      </p>
    </div>

    <div class="savebar">
      <template v-if="view.published">
        <a
          :href="`${exportBase}?format=txt`"
          class="link"
        >Baixar texto</a>
        <a
          :href="`${exportBase}?format=html`"
          target="_blank"
          rel="noopener"
          class="link"
        >Imprimir</a>
      </template>
      <button
        type="button"
        class="btn btn--secondary"
        style="min-height:52px;font-size:15px"
        :disabled="busy || !dirty"
        @click="saveDraft"
      >
        Salvar rascunho
      </button>
      <button
        type="button"
        class="btn btn--float"
        style="padding:12px 24px"
        :disabled="busy"
        @click="save"
      >
        {{ canPublish ? 'Publicar' : 'Salvar e enviar' }}
      </button>
    </div>

    <Sheet
      v-model:open="collectSheet"
      title="Coletas do dia"
      lede="Escolha a coleta que entra neste roteiro."
    >
      <div class="stack-sm">
        <button
          v-for="(c, i) in est?.suggestion.collects ?? []"
          :key="i"
          type="button"
          class="card"
          style="text-align:left;cursor:pointer"
          @click="chooseCollect(i)"
        >
          <p
            v-if="c.title"
            class="strong"
          >
            {{ c.title }}
          </p>
          <p
            class="prose clamp3"
            style="margin-top:4px"
          >
            {{ c.text }}
          </p>
        </button>
        <p
          v-if="!est?.suggestion.collects.length"
          class="soft"
        >
          O Estêvão não trouxe coletas para este dia.
        </p>
      </div>
    </Sheet>
  </div>
</template>
