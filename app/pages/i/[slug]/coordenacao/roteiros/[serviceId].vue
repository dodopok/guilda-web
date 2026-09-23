<script setup lang="ts">
import type { Duty, EditableBlock, LiturgicalSuggestion, ScriptView } from '~/types'

useHead({ title: 'Editar roteiro' })
const route = useRoute()
const serviceId = String(route.params.serviceId)
const { capi, tz, link, slug } = useChurch()
const toast = useToast()

const { data, refresh } = await useAsyncData(`script-edit-${serviceId}`, () => capi<ScriptView>(`/scripts/${serviceId}`))
const { data: aux } = await useAsyncData(`script-aux-${serviceId}`, async () => {
  const [cat, people, templates] = await Promise.all([
    capi<{ duties: Duty[] }>('/catalog'),
    capi<{ people: { id: string, displayName: string, status?: string }[] }>('/people'),
    capi<{ templates: { id: string, name: string, kind: string, description: string | null, archived: boolean, blockCount: number }[] }>('/templates'),
  ])
  return { duties: cat.duties.filter((d) => d.active), people: people.people.filter((p) => p.status !== 'inactive'), templates: templates.templates.filter((t) => !t.archived) }
})

// ---------------------------------------------------------------- criação
const creating = ref(false)
async function create(templateId: string | null) {
  creating.value = true
  try {
    await capi(`/scripts/${serviceId}`, { method: 'POST', body: { templateId } })
    await refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    creating.value = false
  }
}

// ---------------------------------------------------------------- blocos (edição local)
const blocks = ref<EditableBlock[]>([])
const title = ref('')
const snapshotKey = ref('')
function toEditable() {
  const d = data.value?.draft
  if (!d) return
  blocks.value = d.blocks.map((b) => ({ key: b.id, type: b.type, title: b.title, body: b.body, textSource: b.textSource, dutyId: b.dutyId, personId: b.personId, data: { ...b.data }, responsibles: b.responsibles, songs: b.songs }))
  title.value = d.title
  snapshotKey.value = serialize()
}
function serialize() {
  return JSON.stringify([title.value, blocks.value.map(({ type, title: t, body, textSource, dutyId, personId, data: dd }) => ({ type, t, body, textSource, dutyId, personId, dd }))])
}
watch(() => data.value?.draft?.updatedAt, toEditable, { immediate: true })
const dirty = computed(() => serialize() !== snapshotKey.value)
onBeforeRouteLeave(() => {
  if (dirty.value && !window.confirm('Há alterações não salvas no roteiro. Sair mesmo assim?')) return false
})

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    if (title.value !== data.value?.draft?.title) await capi(`/scripts/${serviceId}`, { method: 'PATCH', body: { title: title.value } })
    await capi(`/scripts/${serviceId}/blocks`, {
      method: 'PUT',
      body: { blocks: blocks.value.map((b) => ({ type: b.type, title: b.title, body: b.body, textSource: b.textSource, dutyId: b.dutyId, personId: b.personId, data: { ...b.data, items: b.data.items?.filter((it) => it.text.trim()) } })) },
    })
    toast.ok('Roteiro salvo.')
    await refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}
const publishing = ref(false)
async function publish() {
  if (dirty.value) await save()
  publishing.value = true
  try {
    const r = await capi<{ version: number }>(`/scripts/${serviceId}/publish`, { method: 'POST' })
    toast.ok(`Roteiro publicado (versão ${r.version}). Já está disponível no app.`)
    await refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    publishing.value = false
  }
}

// ---------------------------------------------------------------- Estêvão
type Fetch = { ok: true, snapshotId: string, fetchedAt: string, suggestion: LiturgicalSuggestion } | { ok: false, error: { kind: string, message: string }, cached: { snapshotId: string, fetchedAt: string, suggestion: LiturgicalSuggestion } | null }
const est = ref<Fetch | null>(null)
const estLoading = ref(false)
const suggestion = computed(() => (est.value?.ok ? est.value.suggestion : est.value?.cached?.suggestion) ?? null)
const snapshotId = computed(() => (est.value?.ok ? est.value.snapshotId : est.value?.cached?.snapshotId) ?? null)
const pick = reactive({ collect: 0 as number | null, readings: [] as string[], replaceReadings: true, applyCalendar: true })
async function fetchEstevao() {
  estLoading.value = true
  try {
    est.value = await capi<Fetch>(`/scripts/${serviceId}/liturgical-data`)
    const s = suggestion.value
    if (s) {
      pick.collect = s.collects.length ? 0 : null
      pick.readings = s.readings.filter((r) => r.key !== 'psalm_alternative').map((r) => `${r.key}|${r.reference}`)
    }
  } catch (e) {
    toast.error(e)
  } finally {
    estLoading.value = false
  }
}
async function applyEstevao() {
  if (!snapshotId.value || !suggestion.value) return
  if (dirty.value) await save()
  const chosen = suggestion.value.readings.flatMap((r) => {
    const opts = [r.reference, ...r.alternatives]
    const sel = opts.find((ref) => pick.readings.includes(`${r.key}|${ref}`))
    return sel ? [{ key: r.key, reference: sel, label: r.label }] : []
  })
  try {
    await capi(`/scripts/${serviceId}/liturgical-data/apply`, { method: 'POST', body: { snapshotId: snapshotId.value, collectIndex: pick.collect, readings: chosen, replaceReadings: pick.replaceReadings, applyCalendar: pick.applyCalendar } })
    toast.ok('Aplicado ao roteiro. Confira as leituras e atribua cada uma a uma pessoa.')
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}
const manual = reactive({ sundayName: '', celebration: '', color: '', season: '' })
watchEffect(() => {
  const l = data.value?.draft?.liturgy
  if (l) Object.assign(manual, { sundayName: l.sundayName ?? '', celebration: l.celebration ?? '', color: l.color ?? '', season: l.season ?? '' })
})
async function saveManual() {
  try {
    await capi(`/scripts/${serviceId}`, { method: 'PATCH', body: { liturgy: { sundayName: manual.sundayName || null, celebration: manual.celebration || null, color: manual.color || null, season: manual.season || null, source: 'manual' } } })
    toast.ok('Dados do dia salvos.')
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}
async function setChooser(v: 'preacher' | 'pastors') {
  try {
    await capi(`/scripts/${serviceId}`, { method: 'PATCH', body: { musicChooser: v } })
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}
const musicBlock = computed(() => data.value?.draft?.blocks.find((b) => b.type === 'music'))
const versions = ref<{ version: number, publishedAt: string, liturgicalSource: { source: string, fetchedAt: string | null, prayerBook: string | null } }[] | null>(null)
async function loadVersions() {
  versions.value = (await capi<{ versions: NonNullable<typeof versions.value> }>(`/scripts/${serviceId}/versions`)).versions
}
const exportBase = computed(() => `/api/v1/churches/${slug.value}/scripts/${serviceId}/export`)
</script>

<template>
  <div class="page page--wide">
    <p
      class="no-print"
      style="margin-bottom:1rem"
    >
      <NuxtLink :to="link('/coordenacao/roteiros')"><Icon
        name="arrow-left"
        style="width:1rem;height:1rem;vertical-align:-.15em"
      /> Roteiros</NuxtLink>
    </p>
    <template v-if="data">
      <div class="page-head">
        <p class="kicker">
          {{ longDate(data.service.startsAt, tz) }} · {{ time(data.service.startsAt, tz) }}
        </p>
        <h1>{{ data.draft?.title ?? data.service.title }}</h1>
        <p
          v-if="data.draft"
          class="lede"
        >
          <template v-if="data.published">
            Publicado · versão {{ data.published.version }}<template v-if="data.draft.hasUnpublishedChanges">
              · há alterações ainda não publicadas
            </template>
          </template>
          <template v-else>
            Rascunho: ainda não aparece para os voluntários.
          </template>
        </p>
      </div>

      <!-- Sem roteiro: escolher modelo -->
      <section v-if="!data.draft">
        <div class="section-head">
          <h2>Começar a partir de um modelo</h2>
        </div>
        <ul class="lines">
          <li
            v-for="t in aux?.templates ?? []"
            :key="t.id"
            class="line"
          >
            <span class="line__main">
              <span class="line__title">{{ t.name }}</span> <span class="tag tag--plain">{{ t.kind === 'short' ? 'curto' : t.kind === 'special' ? 'especial' : 'comum' }}</span>
              <span
                class="line__sub"
                style="display:block"
              >{{ t.description }} · {{ plural(t.blockCount, 'bloco', 'blocos') }}</span>
            </span>
            <button
              type="button"
              class="btn btn--primary btn--small"
              :disabled="creating"
              @click="create(t.id)"
            >
              Usar este modelo
            </button>
          </li>
        </ul>
        <button
          type="button"
          class="btn"
          style="margin-top:1rem"
          :disabled="creating"
          @click="create(null)"
        >
          Começar em branco
        </button>
      </section>

      <template v-else>
        <div
          v-if="data.needsReview?.required"
          class="notice notice--wait"
          style="margin-bottom:1.25rem"
        >
          <h3>A escala mudou depois da publicação</h3>
          <p
            v-for="(c, i) in data.needsReview.changes"
            :key="i"
          >
            {{ c.blockTitle }}: publicado com {{ c.published.join(', ') || 'ninguém' }}; agora {{ c.current.join(', ') || 'ninguém' }}.
          </p>
          <p class="small">
            A versão publicada não muda sozinha. Publique de novo para atualizar.
          </p>
        </div>
        <div
          v-if="data.draft.pastoralNote"
          class="notice notice--accent"
          style="margin-bottom:1.25rem"
        >
          <h3>Observação pastoral</h3>
          <p style="white-space:pre-line">
            {{ data.draft.pastoralNote }}
          </p>
        </div>

        <div
          class="row no-print"
          style="position:sticky;top:calc(var(--bar-h) + .25rem);z-index:5;background:var(--paper);padding:.6rem 0;border-bottom:1px solid var(--rule);margin-bottom:1.25rem"
        >
          <button
            type="button"
            class="btn btn--primary"
            :disabled="!dirty || saving"
            @click="save"
          >
            {{ saving ? 'Salvando…' : dirty ? 'Salvar alterações' : 'Tudo salvo' }}
          </button>
          <button
            type="button"
            class="btn"
            :disabled="publishing"
            @click="publish"
          >
            <Icon name="send" /> Publicar {{ data.published ? `versão ${data.published.version + 1}` : 'roteiro' }}
          </button>
          <NuxtLink
            class="btn btn--quiet"
            :to="link(`/roteiros/${serviceId}`)"
          >Ver como leitor</NuxtLink>
          <template v-if="data.published">
            <a
              class="btn btn--quiet"
              :href="`${exportBase}?format=html`"
              target="_blank"
              rel="noopener"
            ><Icon name="print" /> Imprimir</a>
            <a
              class="btn btn--quiet"
              :href="`${exportBase}?format=txt`"
            ><Icon name="download" /> Texto</a>
          </template>
        </div>

        <div class="split">
          <div>
            <label
              class="field"
              style="margin-bottom:1.25rem"
            ><span class="field__label">Título do roteiro</span><input
              v-model="title"
              class="input"
              style="font-family:var(--serif);font-size:1.25rem"
            ></label>
            <BlockListEditor
              v-model="blocks"
              mode="script"
              :duties="aux?.duties ?? []"
              :people="aux?.people ?? []"
            />
          </div>
          <aside class="stack">
            <section>
              <div class="section-head">
                <h2>Liturgia do dia</h2>
              </div>
              <p
                class="small ink-2"
                style="margin-top:.5rem"
              >
                {{ [data.draft.liturgy.sundayName, data.draft.liturgy.celebration, data.draft.liturgy.color && `cor ${data.draft.liturgy.color}`].filter(Boolean).join(' · ') || 'Ainda sem dados litúrgicos.' }}
                <template v-if="data.draft.snapshot">
                  <br>Estêvão, consultado em {{ dateTime(data.draft.snapshot.fetchedAt, tz) }}.
                </template>
              </p>
              <button
                type="button"
                class="btn btn--small"
                style="margin-top:.75rem"
                :disabled="estLoading"
                @click="fetchEstevao"
              >
                {{ estLoading ? 'Consultando…' : 'Buscar sugestões no Estêvão' }}
              </button>

              <div
                v-if="est && !est.ok"
                class="notice notice--wait small"
                style="margin-top:.75rem"
              >
                <p><strong>Estêvão indisponível.</strong> {{ est.error.message }}</p>
                <p v-if="est.cached">
                  Mostrando a última consulta guardada ({{ dateTime(est.cached.fetchedAt, tz) }}).
                </p>
                <p v-else>
                  Preencha os dados abaixo à mão; o roteiro funciona sem a integração.
                </p>
              </div>

              <form
                v-if="suggestion"
                class="stack-sm"
                style="margin-top:1rem"
                @submit.prevent="applyEstevao"
              >
                <p class="small">
                  <strong>{{ suggestion.sundayName ?? suggestion.celebration ?? 'Dia' }}</strong>{{ suggestion.color ? ` · ${suggestion.color}` : '' }}{{ suggestion.season ? ` · ${suggestion.season}` : '' }}
                </p>
                <fieldset v-if="suggestion.collects.length">
                  <legend class="small">
                    Coleta
                  </legend>
                  <label
                    v-for="(c, i) in suggestion.collects"
                    :key="i"
                    class="check small"
                  ><input
                    v-model="pick.collect"
                    type="radio"
                    :value="i"
                  ><span class="check__text"><strong>{{ c.title }}</strong><span
                    class="muted"
                    style="display:block"
                  >{{ c.text.slice(0, 120) }}{{ c.text.length > 120 ? '…' : '' }}</span></span></label>
                  <label class="check small"><input
                    v-model="pick.collect"
                    type="radio"
                    :value="null"
                  ><span class="check__text">Manter a coleta atual</span></label>
                </fieldset>
                <fieldset>
                  <legend class="small">
                    Leituras (quantas quiser)
                  </legend>
                  <template
                    v-for="r in suggestion.readings"
                    :key="r.key"
                  >
                    <label
                      v-for="refr in [r.reference, ...r.alternatives]"
                      :key="refr"
                      class="check small"
                    ><input
                      v-model="pick.readings"
                      type="checkbox"
                      :value="`${r.key}|${refr}`"
                    ><span class="check__text">{{ r.label }}: <strong>{{ refr }}</strong>{{ refr !== r.reference ? ' (alternativa)' : '' }}</span></label>
                  </template>
                </fieldset>
                <label class="check small"><input
                  v-model="pick.replaceReadings"
                  type="checkbox"
                ><span class="check__text">Substituir as leituras atuais (mantém quem lê cada posição)</span></label>
                <label class="check small"><input
                  v-model="pick.applyCalendar"
                  type="checkbox"
                ><span class="check__text">Usar nome do domingo, celebração e cor</span></label>
                <button class="btn btn--primary btn--small">
                  Aplicar ao roteiro
                </button>
              </form>

              <details style="margin-top:1rem">
                <summary
                  class="small"
                  style="cursor:pointer"
                >
                  Preencher à mão
                </summary>
                <form
                  class="stack-sm"
                  style="margin-top:.5rem"
                  @submit.prevent="saveManual"
                >
                  <label class="field"><span class="field__label">Nome do domingo</span><input
                    v-model="manual.sundayName"
                    class="input"
                  ></label>
                  <label class="field"><span class="field__label">Celebração</span><input
                    v-model="manual.celebration"
                    class="input"
                  ></label>
                  <div class="fields-2">
                    <label class="field"><span class="field__label">Cor</span>
                      <select
                        v-model="manual.color"
                        class="select"
                      ><option value="">—</option><option
                        v-for="c in LITURGICAL_COLORS"
                        :key="c"
                        :value="c"
                      >{{ c }}</option></select>
                    </label>
                    <label class="field"><span class="field__label">Tempo</span><input
                      v-model="manual.season"
                      class="input"
                    ></label>
                  </div>
                  <button class="btn btn--small">
                    Salvar dados do dia
                  </button>
                </form>
              </details>
            </section>

            <section>
              <div class="section-head">
                <h2>Músicas</h2>
              </div>
              <fieldset style="margin:.6rem 0 1rem">
                <legend class="small">
                  Quem escolhe neste culto
                </legend>
                <label class="check small"><input
                  type="radio"
                  :checked="data.draft.musicChooser === 'preacher'"
                  @change="setChooser('preacher')"
                ><span>Quem prega</span></label>
                <label class="check small"><input
                  type="radio"
                  :checked="data.draft.musicChooser === 'pastors'"
                  @change="setChooser('pastors')"
                ><span>Os pastores</span></label>
              </fieldset>
              <MusicChooser
                :service-id="serviceId"
                :selected="musicBlock?.songs ?? []"
                :block-id="musicBlock?.id"
                @saved="refresh"
              />
            </section>

            <section>
              <div class="section-head">
                <h2>Versões</h2>
                <button
                  v-if="!versions"
                  type="button"
                  class="btn btn--quiet btn--small"
                  @click="loadVersions"
                >
                  Mostrar
                </button>
              </div>
              <ul
                v-if="versions"
                class="lines lines--tight small"
              >
                <li
                  v-for="v in versions"
                  :key="v.version"
                >
                  <a
                    :href="`${exportBase}?format=html&version=${v.version}`"
                    target="_blank"
                    rel="noopener"
                  >Versão {{ v.version }}</a> · {{ dateTime(v.publishedAt, tz) }}
                  <span
                    class="muted"
                    style="display:block"
                  >{{ v.liturgicalSource.source === 'estevao' ? `Estêvão (${v.liturgicalSource.prayerBook}), consulta de ${dateTime(v.liturgicalSource.fetchedAt!, tz)}` : 'dados litúrgicos preenchidos à mão' }}</span>
                </li>
                <li
                  v-if="!versions.length"
                  class="muted"
                >
                  Ainda não publicado.
                </li>
              </ul>
            </section>
          </aside>
        </div>
      </template>
    </template>
  </div>
</template>
