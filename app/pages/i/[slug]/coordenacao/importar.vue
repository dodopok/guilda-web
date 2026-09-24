<script setup lang="ts">
useHead({ title: 'Importar planilha' })
const { capi, tz, link } = useChurch()
const toast = useToast()

interface PreviewPerson { raw: string, key: string, status: 'ok' | 'suggested' | 'ambiguous' | 'unknown' | 'ignored', personId: string | null, personName: string | null, candidates: { id: string, name: string }[] }
interface PreviewRow { line: number, date: string | null, label: string, labelKey: string, duty: { id: string, name: string } | null, dutyIgnored: boolean, people: PreviewPerson[], issues: string[] }
interface Preview {
  month: string
  rows: PreviewRow[]
  summary: { rows: number, dates: string[], assignments: number, unknownDuties: string[], unresolvedPeople: PreviewPerson[], nonSundayDates: string[] }
  duties: { id: string, name: string }[]
  people: { id: string, name: string }[]
}
type Stats = { servicesCreated: number, assignmentsCreated: number, alreadyAssigned: number, skippedRows: number, alreadyImported: boolean }

const step = ref<1 | 2 | 3>(1)
const STEPS = ['Colar', 'Conferir', 'Importar']
const cur = currentMonth(tz.value)
const months = [-1, 0, 1, 2].map((d) => shiftMonth(cur, d))
const month = ref(shiftMonth(cur, 1))
const text = ref('')
const defaultTime = ref('09:30')
const fileName = ref('')
const preview = ref<Preview | null>(null)
const dutyRes = reactive<Record<string, string>>({})
const peopleRes = reactive<Record<string, string>>({}) // chave -> personId | 'ignore' | '__new'
const busy = ref(false)
const result = ref<Stats | null>(null)
const importPreviewOpen = ref(false)
let previewMedia: MediaQueryList | null = null
function syncPreviewForViewport() {
  if (previewMedia?.matches) importPreviewOpen.value = true
}
onMounted(() => {
  previewMedia = window.matchMedia('(min-width: 900px)')
  syncPreviewForViewport()
  previewMedia.addEventListener('change', syncPreviewForViewport)
})
onUnmounted(() => previewMedia?.removeEventListener('change', syncPreviewForViewport))

// .xlsx vira texto separado por ";" no próprio navegador; o arquivo não sai do aparelho.
async function readFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    if (/\.xlsx$/i.test(file.name)) {
      const { readSheet } = await import('read-excel-file/browser')
      const rows = await readSheet(file)
      const cell = (v: unknown) => {
        if (v instanceof Date) return `${String(v.getUTCDate()).padStart(2, '0')}/${String(v.getUTCMonth() + 1).padStart(2, '0')}/${v.getUTCFullYear()}`
        const s = v == null ? '' : String(v)
        return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }
      text.value = rows.map((r) => r.map(cell).join(';')).join('\n')
    } else {
      text.value = await file.text()
    }
    fileName.value = file.name
  } catch {
    toast.error('Não consegui ler esse arquivo. Tente salvar como .xlsx ou .csv, ou copie e cole as linhas.')
  } finally {
    input.value = ''
  }
}

function resolutions() {
  const people = Object.fromEntries(Object.entries(peopleRes).filter(([, v]) => v && v !== '__new'))
  return { duties: Object.fromEntries(Object.entries(dutyRes).filter(([, v]) => v)), people }
}
function payload() {
  return { month: month.value, csv: text.value, defaultTime: defaultTime.value, resolutions: resolutions(), saveAliases: true }
}
async function runPreview() {
  if (text.value.trim().length < 10) {
    toast.error('Cole as linhas da planilha ou envie o arquivo.')
    return
  }
  busy.value = true
  try {
    preview.value = await capi<Preview>('/import/preview', { method: 'POST', body: payload() })
    for (const p of preview.value.summary.unresolvedPeople) {
      if (p.status === 'suggested' && p.candidates[0] && !peopleRes[p.key]) peopleRes[p.key] = p.candidates[0].id
    }
    step.value = 2
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}

const nameOf = computed(() => new Map((preview.value?.people ?? []).map((p) => [p.id, p.name])))
// Onde cada nome aparece, para ajudar a reconhecer: "04/10 · Leitura".
const unknownPeople = computed(() => {
  const pv = preview.value
  if (!pv) return []
  return pv.summary.unresolvedPeople.map((p) => {
    const row = pv.rows.find((r) => r.people.some((x) => x.key === p.key))
    return { ...p, where: row ? [row.date ? shortDate(`${row.date}T12:00:00Z`, 'UTC') : null, row.duty?.name ?? row.label].filter(Boolean).join(' · ') : '' }
  })
})
const unknownDuties = computed(() => (preview.value?.summary.unknownDuties ?? []).map((label) => ({ label, key: label.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim() })))

function personState(p: PreviewPerson) {
  if (p.status === 'ok') return { name: p.personName ?? p.raw, tag: null as null | { t: string, bg: string, fg: string } }
  const r = peopleRes[p.key]
  if (r === '__new') return { name: p.raw, tag: { t: 'pessoa nova', bg: '#e3ebf8', fg: '#2f5fa8' } }
  if (r === 'ignore') return { name: p.raw, tag: { t: 'fica de fora', bg: '#f0efe9', fg: '#4a5450' } }
  if (r) return { name: p.raw, tag: { t: `= ${nameOf.value.get(r) ?? ''}`, bg: '#e3f3e8', fg: '#155f30' } }
  return { name: p.raw, tag: { t: 'conferir', bg: '#fff1d6', fg: '#a86400' } }
}
const lines = computed(() => (preview.value?.rows ?? []).flatMap((r) => {
  const dutyOk = Boolean(r.duty) || (dutyRes[r.labelKey] && dutyRes[r.labelKey] !== 'ignore')
  const dutyLabel = r.duty?.name ?? (dutyRes[r.labelKey] && dutyRes[r.labelKey] !== 'ignore' ? preview.value!.duties.find((d) => d.id === dutyRes[r.labelKey])?.name : r.label)
  return r.people.filter((p) => p.status !== 'ignored').map((p) => ({ key: `${r.line}-${p.key}`, day: r.date ? shortDate(`${r.date}T12:00:00Z`, 'UTC') : '—', duty: dutyLabel ?? r.label, dutyOk, ...personState(p), ok: dutyOk && (p.status === 'ok' || (peopleRes[p.key] && peopleRes[p.key] !== 'ignore')) }))
}))
const importable = computed(() => lines.value.filter((l) => l.ok).length)
const pendingNames = computed(() => unknownPeople.value.filter((p) => !peopleRes[p.key]).length)
const stats = computed(() => {
  const pv = preview.value
  if (!pv) return []
  const known = new Set(pv.rows.flatMap((r) => r.people.filter((p) => p.status === 'ok').map((p) => p.personId)))
  const duties = new Set(pv.rows.filter((r) => r.duty).map((r) => r.duty!.id))
  return [
    { n: known.size, label: 'pessoas reconhecidas', color: 'var(--ink)' },
    { n: duties.size, label: 'funções', color: 'var(--ink)' },
    { n: pv.summary.dates.length, label: 'cultos', color: 'var(--ink)' },
    { n: pendingNames.value, label: 'nomes para conferir', color: pendingNames.value ? '#a86400' : 'var(--ink)' },
  ]
})
const SHOW = 40

async function confirm() {
  busy.value = true
  try {
    // "Criar pessoa nova": cadastra só com o nome; celular e funções ficam para Pessoas.
    for (const p of unknownPeople.value.filter((x) => peopleRes[x.key] === '__new')) {
      const r = await capi<{ person: { id: string } }>('/people', { method: 'POST', body: { displayName: p.raw } })
      peopleRes[p.key] = r.person.id
    }
    result.value = await capi<Stats>('/import/apply', { method: 'POST', body: payload() })
    step.value = 3
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}
function restart() {
  for (const k of Object.keys(peopleRes)) Reflect.deleteProperty(peopleRes, k)
  for (const k of Object.keys(dutyRes)) Reflect.deleteProperty(dutyRes, k)
  preview.value = null
  result.value = null
  text.value = ''
  fileName.value = ''
  step.value = 1
}
</script>

<template>
  <div class="stack-lg w-760">
    <PageHead
      title="Importar a planilha antiga"
      lede="Cole o conteúdo ou envie o arquivo. A gente reconhece pessoas, funções e cultos."
      :back="link('/coordenacao/configuracoes')"
      back-label="Configurações"
    />
    <ol
      class="row"
      style="gap:6px;list-style:none;margin:0;padding:0"
      aria-label="Etapas"
    >
      <li
        v-for="(s, i) in STEPS"
        :key="s"
        class="stag"
        style="padding:5px 12px"
        :style="i + 1 === step ? { background: 'var(--ink)', color: '#fff' } : i + 1 < step ? { background: 'var(--accent-soft)', color: 'var(--accent-deep)' } : { background: 'var(--surface-4)', color: 'var(--muted)' }"
        :aria-current="i + 1 === step ? 'step' : undefined"
      >
        {{ i + 1 }}. {{ s }}
      </li>
    </ol>

    <template v-if="step === 1">
      <div class="card stack-md">
        <div class="fields-2">
          <label class="field"><span class="field__label">Mês da escala</span><select
            v-model="month"
            class="select"
          ><option
            v-for="m in months"
            :key="m"
            :value="m"
          >{{ monthLabel(m) }}</option></select></label>
          <label class="field"><span class="field__label">Horário dos cultos novos</span><input
            v-model="defaultTime"
            class="input"
            type="time"
          ></label>
        </div>
        <label class="field"><span class="field__label">Cole aqui — direto da planilha (data; função; nome)</span><textarea
          v-model="text"
          class="textarea mono"
          style="min-height:150px;resize:vertical"
          spellcheck="false"
        /></label>
        <div
          class="row"
          style="gap:10px"
        >
          <span
            class="muted"
            style="font-size:14px"
          >ou</span>
          <label
            class="btn btn--secondary btn--sm"
            style="min-height:44px;font-size:15px;position:relative;overflow:hidden;cursor:pointer"
          >
            <Icon
              name="upload"
              :weight="2"
            />Enviar arquivo (.xlsx, .csv)
            <input
              type="file"
              accept=".xlsx,.csv,.tsv,.txt,text/csv"
              style="position:absolute;inset:0;opacity:0;cursor:pointer"
              @change="readFile"
            >
          </label>
          <span
            v-if="fileName"
            class="strong"
            style="font-size:14px;font-weight:700"
          >{{ fileName }}</span>
        </div>
        <p class="small muted">
          A planilha não é alterada. Repetir a mesma importação não duplica nada.
        </p>
      </div>
      <div class="savebar">
        <button
          type="button"
          class="btn btn--float"
          :disabled="busy"
          @click="runPreview"
        >
          Ver o que reconhecemos
        </button>
      </div>
    </template>

    <template v-else-if="step === 2 && preview">
      <div class="statgrid">
        <div
          v-for="s in stats"
          :key="s.label"
          class="stat"
        >
          <p
            class="stat__n"
            :style="{ color: s.color }"
          >
            {{ s.n }}
          </p>
          <p
            class="stat__l"
            style="margin-top:4px;font-size:14px"
          >
            {{ s.label }}
          </p>
        </div>
      </div>

      <div class="import-review-layout">
        <div class="stack-md import-review-issues">
          <div
            v-if="unknownPeople.length"
            class="card"
          >
            <div
              class="row"
              style="gap:10px"
            >
              <h2 style="font-size:18px;flex:1">
                Nomes que não reconhecemos
              </h2>
              <span class="badge-amber">{{ unknownPeople.length }}</span>
            </div>
            <p
              class="soft"
              style="margin:4px 0 12px;font-size:14px"
            >
              Diga quem é cada um — ou crie a pessoa.
            </p>
            <div class="stack-sm">
              <div
                v-for="p in unknownPeople"
                :key="p.key"
                class="row"
                style="gap:10px;padding:10px 12px;border-radius:14px;background:var(--surface-2)"
              >
                <span
                  class="strong"
                  style="min-width:110px"
                >“{{ p.raw }}”</span>
                <span
                  class="muted"
                  style="font-size:13.5px;flex:1;min-width:120px"
                >{{ p.where }}</span>
                <select
                  v-model="peopleRes[p.key]"
                  class="select"
                  style="width:auto;min-width:180px;min-height:40px;padding:8px 12px;font-size:14.5px"
                  :aria-label="`Quem é ${p.raw}?`"
                >
                  <option :value="undefined">
                    Quem é?
                  </option>
                  <optgroup
                    v-if="p.candidates.length"
                    label="Parecidos"
                  >
                    <option
                      v-for="c in p.candidates"
                      :key="c.id"
                      :value="c.id"
                    >
                      {{ c.name }}
                    </option>
                  </optgroup>
                  <optgroup label="Todas as pessoas">
                    <option
                      v-for="c in preview.people"
                      :key="c.id"
                      :value="c.id"
                    >
                      {{ c.name }}
                    </option>
                  </optgroup>
                  <option value="__new">
                    Criar pessoa nova
                  </option>
                  <option value="ignore">
                    Não importar este nome
                  </option>
                </select>
              </div>
            </div>
          </div>

          <div
            v-if="unknownDuties.length"
            class="card"
          >
            <div
              class="row"
              style="gap:10px"
            >
              <h2 style="font-size:18px;flex:1">
                Funções que não reconhecemos
              </h2>
              <span class="badge-amber">{{ unknownDuties.length }}</span>
            </div>
            <p
              class="soft"
              style="margin:4px 0 12px;font-size:14px"
            >
              Ligue cada rótulo da planilha a uma função da igreja.
            </p>
            <div class="stack-sm">
              <div
                v-for="d in unknownDuties"
                :key="d.key"
                class="row"
                style="gap:10px;padding:10px 12px;border-radius:14px;background:var(--surface-2)"
              >
                <span
                  class="strong"
                  style="flex:1;min-width:140px"
                >“{{ d.label }}”</span>
                <select
                  v-model="dutyRes[d.key]"
                  class="select"
                  style="width:auto;min-width:180px;min-height:40px;padding:8px 12px;font-size:14.5px"
                  :aria-label="`Qual função é ${d.label}?`"
                >
                  <option :value="undefined">
                    Qual função?
                  </option>
                  <option
                    v-for="x in preview.duties"
                    :key="x.id"
                    :value="x.id"
                  >
                    {{ x.name }}
                  </option>
                  <option value="ignore">
                    Não importar
                  </option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <details
          class="card import-preview"
          :open="importPreviewOpen"
          @toggle="importPreviewOpen = ($event.currentTarget as HTMLDetailsElement).open"
        >
          <summary
            class="row row--between"
            @click="syncPreviewForViewport"
          >
            <span class="grow"><strong>Ver as {{ lines.length }} linhas reconhecidas</strong><span class="import-preview__sub">Conferidas automaticamente; abra para revisar</span></span>
            <span class="tag tag--ok">{{ importable }} entram</span>
            <Icon
              name="chevron-down"
              :weight="2"
              class="listrow__chev"
            />
          </summary>
          <div class="import-preview__body">
            <div
              v-for="l in lines.slice(0, SHOW)"
              :key="l.key"
              class="row"
              style="gap:10px;padding:8px 0;border-top:1px solid var(--line-2);font-size:14.5px;flex-wrap:nowrap"
            >
              <span
                class="strong"
                style="min-width:56px;font-weight:700"
              >{{ l.day }}</span>
              <span
                class="soft"
                style="min-width:110px"
                :style="l.dutyOk ? '' : 'color:#a86400'"
              >{{ l.duty }}</span>
              <span style="flex:1;min-width:0">{{ l.name }}</span>
              <span
                v-if="l.tag"
                class="stag"
                :style="{ background: l.tag.bg, color: l.tag.fg }"
              >{{ l.tag.t }}</span>
            </div>
            <p
              v-if="lines.length > SHOW"
              class="small muted"
              style="padding-top:8px"
            >
              e mais {{ lines.length - SHOW }} linhas.
            </p>
            <p
              v-if="preview.summary.nonSundayDates.length"
              class="small"
              style="padding-top:8px;color:#a86400"
            >
              Datas fora do domingo: {{ preview.summary.nonSundayDates.map((d) => shortDate(`${d}T12:00:00Z`, 'UTC')).join(', ') }}. Confira se estão certas.
            </p>
          </div>
        </details>
      </div>

      <div class="savebar">
        <button
          type="button"
          class="btn btn--secondary btn--sm"
          style="min-height:44px;font-size:15px"
          @click="step = 1"
        >
          Voltar
        </button>
        <button
          type="button"
          class="btn btn--float"
          :disabled="busy || !importable"
          @click="confirm"
        >
          Importar {{ plural(importable, 'escala', 'escalas') }}
        </button>
      </div>
    </template>

    <template v-else-if="step === 3 && result">
      <div
        class="panel panel--ok stack-sm"
        role="status"
      >
        <p
          class="strong"
          style="font-size:18px"
        >
          {{ result.alreadyImported ? 'Esta planilha já tinha sido importada' : 'Importação concluída' }}
        </p>
        <p v-if="result.alreadyImported">
          Nada foi duplicado.
        </p>
        <p v-else>
          {{ plural(result.assignmentsCreated, 'escala criada', 'escalas criadas') }} em {{ plural(result.servicesCreated, 'culto novo', 'cultos novos') }}{{ result.alreadyAssigned ? `; ${result.alreadyAssigned} já estavam lá` : '' }}{{ result.skippedRows ? `; ${plural(result.skippedRows, 'linha ficou', 'linhas ficaram')} de fora` : '' }}.
        </p>
      </div>
      <div
        class="row"
        style="gap:10px"
      >
        <NuxtLink
          :to="link(`/coordenacao/preparar/${month}`)"
          class="btn"
        >
          Ver a escala de {{ monthName(month) }}
        </NuxtLink>
        <button
          type="button"
          class="btn btn--secondary"
          @click="restart"
        >
          Importar outro mês
        </button>
      </div>
    </template>
  </div>
</template>
