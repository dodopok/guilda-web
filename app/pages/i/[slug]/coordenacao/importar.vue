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

const month = ref(shiftMonth(currentMonth(tz.value), 1))
const csv = ref('')
const defaultTime = ref('09:30')
const preview = ref<Preview | null>(null)
const dutyRes = reactive<Record<string, string>>({})
const peopleRes = reactive<Record<string, string>>({})
const saveAliases = ref(true)
const busy = ref(false)
const result = ref<Record<string, number | boolean> | null>(null)

async function readFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) csv.value = await file.text()
}
function body() {
  return { month: month.value, csv: csv.value, defaultTime: defaultTime.value, resolutions: { duties: { ...dutyRes }, people: { ...peopleRes } }, saveAliases: saveAliases.value }
}
async function runPreview() {
  busy.value = true
  result.value = null
  try {
    preview.value = await capi<Preview>('/import/preview', { method: 'POST', body: body() })
    for (const p of preview.value.summary.unresolvedPeople) {
      if (p.status === 'suggested' && p.candidates[0] && !peopleRes[p.key]) peopleRes[p.key] = p.candidates[0].id
    }
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}
async function apply() {
  busy.value = true
  try {
    result.value = await capi<Record<string, number | boolean>>('/import/apply', { method: 'POST', body: body() })
    toast.ok(result.value.alreadyImported ? 'Esta planilha já tinha sido importada: nada foi duplicado.' : 'Importação concluída.')
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}
const STATUS: Record<string, string> = { ok: 'reconhecido', suggested: 'confirme', ambiguous: 'mais de uma pessoa', unknown: 'não encontrado', ignored: 'ignorado' }
const pendingDecisions = computed(() => {
  if (!preview.value) return 0
  const d = preview.value.summary.unknownDuties.filter((l) => !dutyRes[l.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()]).length
  const p = preview.value.summary.unresolvedPeople.filter((x) => !peopleRes[x.key]).length
  return d + p
})
function keyOf(label: string) {
  return label.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}
</script>

<template>
  <div class="page page--wide">
    <div class="page-head">
      <p class="kicker">
        Cadastro
      </p>
      <h1>Importar planilha</h1>
      <p class="lede">
        Traga um mês da planilha de escalas para revisar antes de gravar. A planilha não é alterada, pessoas não são criadas automaticamente e repetir a importação não duplica nada.
      </p>
    </div>

    <form
      class="stack"
      @submit.prevent="runPreview"
    >
      <div
        class="row"
        style="align-items:flex-end"
      >
        <label
          class="field"
          style="margin:0"
        ><span class="field__label">Mês</span><input
          v-model="month"
          class="input"
          type="month"
          required
        ></label>
        <label
          class="field"
          style="margin:0"
        ><span class="field__label">Horário dos cultos</span><input
          v-model="defaultTime"
          class="input"
          type="time"
          required
          style="width:8rem"
        ></label>
        <label
          class="field"
          style="margin:0"
        ><span class="field__label">Arquivo CSV</span><input
          class="input"
          type="file"
          accept=".csv,text/csv,text/plain"
          @change="readFile"
        ></label>
      </div>
      <label class="field"><span class="field__label">Ou cole o conteúdo</span>
        <textarea
          v-model="csv"
          class="textarea"
          style="font-family:ui-monospace,monospace;font-size:.9rem;min-height:9rem"
          placeholder="DATA;MINISTÉRIO;VOLUNTÁRIO"
        />
        <span class="field__hint">Na planilha: aba do mês → Arquivo → Fazer download → CSV. Colunas DATA, MINISTÉRIO e VOLUNTÁRIO; a data pode aparecer só na primeira linha de cada domingo.</span>
      </label>
      <button
        class="btn btn--primary"
        :disabled="busy || csv.length < 10"
      >
        Pré-visualizar
      </button>
    </form>

    <template v-if="preview">
      <section class="section">
        <div class="section-head">
          <h2>Revisão</h2><span class="small muted">{{ preview.summary.rows }} linhas · {{ preview.summary.dates.length }} datas · {{ preview.summary.assignments }} designações reconhecidas</span>
        </div>
        <p
          v-if="preview.summary.nonSundayDates.length"
          class="notice notice--wait small"
          style="margin-top:.75rem"
        >
          Datas que não são domingo: {{ preview.summary.nonSundayDates.join(', ') }}. Confira se o ano e a data estão corretos.
        </p>

        <div
          v-if="preview.summary.unknownDuties.length || preview.summary.unresolvedPeople.length"
          class="split"
          style="margin-top:1rem"
        >
          <div>
            <template v-if="preview.summary.unknownDuties.length">
              <h3>Funções não reconhecidas</h3>
              <div
                v-for="l in preview.summary.unknownDuties"
                :key="l"
                class="row"
                style="margin-top:.5rem"
              >
                <span style="min-width:12rem"><strong>{{ l }}</strong></span>
                <select
                  v-model="dutyRes[keyOf(l)]"
                  class="select"
                  style="max-width:18rem"
                  :aria-label="`Função para ${l}`"
                >
                  <option :value="undefined">
                    Escolher…
                  </option>
                  <option value="ignore">
                    Ignorar estas linhas
                  </option>
                  <option
                    v-for="d in preview.duties"
                    :key="d.id"
                    :value="d.id"
                  >
                    {{ d.name }}
                  </option>
                </select>
              </div>
            </template>
            <template v-if="preview.summary.unresolvedPeople.length">
              <h3 style="margin-top:1.25rem">
                Nomes a conferir
              </h3>
              <p class="small muted">
                Grafias diferentes, apelidos ou só o primeiro nome. Nada é criado sem sua escolha.
              </p>
              <div
                v-for="p in preview.summary.unresolvedPeople"
                :key="p.key"
                class="row"
                style="margin-top:.5rem"
              >
                <span style="min-width:12rem"><strong>{{ p.raw }}</strong> <span class="tag tag--wait">{{ STATUS[p.status] }}</span></span>
                <select
                  v-model="peopleRes[p.key]"
                  class="select"
                  style="max-width:18rem"
                  :aria-label="`Pessoa para ${p.raw}`"
                >
                  <option :value="undefined">
                    Escolher…
                  </option>
                  <option value="ignore">
                    Ignorar
                  </option>
                  <option
                    v-for="c in (p.candidates.length ? p.candidates : [])"
                    :key="c.id"
                    :value="c.id"
                  >
                    {{ c.name }} (sugestão)
                  </option>
                  <option
                    v-for="c in preview.people"
                    :key="`all-${c.id}`"
                    :value="c.id"
                  >
                    {{ c.name }}
                  </option>
                </select>
              </div>
              <label
                class="check"
                style="margin-top:.5rem"
              ><input
                v-model="saveAliases"
                type="checkbox"
              ><span class="check__text small">Lembrar estas correspondências nas próximas importações</span></label>
            </template>
          </div>
          <aside>
            <p class="notice small">
              Depois de decidir, clique em <strong>Pré-visualizar</strong> de novo para conferir.
            </p>
          </aside>
        </div>

        <div
          class="table-wrap"
          style="margin-top:1.25rem"
        >
          <table class="table small">
            <thead>
              <tr>
                <th scope="col">
                  Linha
                </th><th scope="col">
                  Data
                </th><th scope="col">
                  Na planilha
                </th><th scope="col">
                  Função
                </th><th scope="col">
                  Pessoas
                </th><th scope="col">
                  Observações
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in preview.rows"
                :key="r.line"
              >
                <td class="num">
                  {{ r.line }}
                </td>
                <td class="nowrap">
                  {{ r.date ? shortDate(`${r.date}T12:00:00Z`, 'UTC') : '—' }}
                </td>
                <td>{{ r.label }}</td>
                <td>{{ r.duty?.name ?? '—' }}</td>
                <td>
                  <span
                    v-for="(p, i) in r.people"
                    :key="i"
                    style="display:block"
                  >
                    {{ p.raw }}<template v-if="p.personName && p.personName !== p.raw"> → {{ p.personName }}</template>
                    <span
                      v-if="p.status !== 'ok'"
                      class="tag"
                      :class="p.status === 'ignored' ? 'tag--plain' : 'tag--wait'"
                    >{{ STATUS[p.status] }}</span>
                  </span>
                </td>
                <td :style="r.issues.length ? 'color:var(--wait)' : ''">
                  {{ r.issues.join('; ') }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div
          class="row"
          style="margin-top:1.25rem"
        >
          <button
            type="button"
            class="btn btn--primary"
            :disabled="busy || !preview.summary.assignments"
            @click="apply"
          >
            Importar {{ plural(preview.summary.assignments, 'designação', 'designações') }}
          </button>
          <span
            v-if="pendingDecisions"
            class="small muted"
          >{{ pendingDecisions }} ainda sem decisão (essas linhas ficam de fora).</span>
        </div>
      </section>
      <div
        v-if="result"
        class="notice notice--ok"
        style="margin-top:1.5rem"
      >
        <h3>{{ result.alreadyImported ? 'Planilha já importada antes' : 'Importação concluída' }}</h3>
        <p v-if="!result.alreadyImported">
          {{ result.servicesCreated }} cultos criados · {{ result.assignmentsCreated }} designações · {{ result.alreadyAssigned }} já existiam · {{ result.exceptional }} excepcionais (sem habilitação cadastrada) · {{ result.skippedRows }} linhas de fora
        </p>
        <div class="row">
          <NuxtLink
            class="btn btn--small"
            :to="link(`/coordenacao/escalas/${month}`)"
          >Revisar a escala</NuxtLink>
        </div>
      </div>
    </template>
  </div>
</template>
