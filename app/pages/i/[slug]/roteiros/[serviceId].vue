<script setup lang="ts">
import type { ScriptView, Song } from '~/types'

useHead({ title: 'Roteiro' })
const route = useRoute()
const serviceId = computed(() => String(route.params.serviceId))
const { capi, tz, link, slug, isCoordinator, isPastor } = useChurch()
const toast = useToast()

const { data, refresh, error } = await useAsyncData(() => `script-${serviceId.value}`, () => capi<ScriptView>(`/scripts/${serviceId.value}`), { watch: [serviceId] })
const editor = computed(() => Boolean(data.value?.canEdit))
const canPublish = computed(() => Boolean(data.value?.canPublish))

// Sem roteiro: a coordenação começa pelo modelo do tipo do culto.
interface TemplateRow { id: string, name: string, kind: string, archived: boolean }
const templates = ref<TemplateRow[] | null>(null)
const creating = ref(false)
async function ensureScript() {
  if (!data.value || data.value.draft || !isCoordinator.value || creating.value) return
  templates.value = (await capi<{ templates: TemplateRow[] }>('/templates')).templates.filter((t) => !t.archived)
  const t = templates.value.find((x) => x.kind === data.value!.service.kind) ?? templates.value[0]
  if (!t) return
  creating.value = true
  try {
    await capi(`/scripts/${serviceId.value}`, { method: 'POST', body: { templateId: t.id } })
    await refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    creating.value = false
  }
}
watch(() => data.value?.service.id, ensureScript, { immediate: true })

// Apoio ao editor: pessoas (quem lê), repertório e escala deste culto.
interface PubMonth { services: { id: string, slots: { dutyId: string, dutyName: string, people: { personId: string, status: string }[] }[] }[] }
const { data: aux } = await useAsyncData(() => `script-aux-${serviceId.value}`, async () => {
  if (!data.value || !(data.value.canEdit || data.value.canChooseMusic)) return null
  const month = data.value.service.localDate.slice(0, 7)
  const [people, songs, pub] = await Promise.all([
    capi<{ people: { id: string, displayName: string, dutyIds: string[], status?: string }[] }>('/people'),
    capi<{ songs: Song[] }>('/songs'),
    capi<PubMonth>(`/schedule/${month}/published`).catch(() => ({ services: [] }) as PubMonth),
  ])
  const svc = pub.services.find((s) => s.id === data.value!.service.id)
  const scheduled: Record<string, string[]> = {}
  for (const sl of svc?.slots ?? []) {
    scheduled[sl.dutyId] = [...(scheduled[sl.dutyId] ?? []), ...sl.people.filter((p) => p.status !== 'declined').map((p) => p.personId)]
  }
  return { people: people.people.filter((p) => p.status !== 'inactive'), songs: songs.songs, scheduled }
}, { watch: [() => data.value?.service.id] })

// Outros cultos (só para quem edita): troca rápida entre as datas.
interface ScriptRow { serviceId: string, startsAt: string, status: string, script: { version: number, hasUnpublishedChanges: boolean } | null }
const { data: others } = await useAsyncData(() => `script-others-${slug.value}-${data.value?.service.localDate.slice(0, 7)}`, async () => {
  if (!editor.value || !data.value) return []
  const m = data.value.service.localDate.slice(0, 7)
  const lists = await Promise.all([m, shiftMonth(m, 1)].map((x) => capi<{ scripts: ScriptRow[] }>(`/scripts?month=${x}`)))
  return lists.flatMap((l) => l.scripts).filter((s) => s.status === 'scheduled' && Date.parse(s.startsAt) > Date.now() - 86400_000)
}, { watch: [() => data.value?.service.localDate] })

const content = computed(() => data.value?.published?.content ?? null)
const liturgy = computed(() => data.value?.draft?.liturgy ?? content.value?.liturgy ?? {})
const eyebrow = computed(() => [liturgy.value.sundayName ?? liturgy.value.celebration, liturgy.value.season].filter(Boolean).join(' · '))
const draftTag = computed(() => {
  const d = data.value?.draft
  if (!editor.value || !d) return null
  if (!data.value?.published) return 'rascunho'
  return d.hasUnpublishedChanges ? `rascunho · versão ${data.value.published.version + 1}` : `publicado · versão ${data.value.published.version}`
})

// Quem prega (sem editar o resto) escolhe as músicas.
const preacherSongs = ref<string[]>([])
watchEffect(() => {
  preacherSongs.value = data.value?.draft?.blocks.find((b) => b.type === 'music')?.data.songIds ?? []
})
const savingSongs = ref(false)
async function savePreacherSongs() {
  savingSongs.value = true
  try {
    await capi(`/scripts/${serviceId.value}/music`, { method: 'PUT', body: { songIds: preacherSongs.value } })
    const r = await capi<{ recipients: number }>(`/scripts/${serviceId.value}/music/notify`, { method: 'POST' })
    toast.ok(r.recipients ? `Músicas salvas. ${plural(r.recipients, 'pessoa do louvor recebe', 'pessoas do louvor recebem')} o aviso.` : 'Músicas salvas.')
    await refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    savingSongs.value = false
  }
}
const exportBase = computed(() => `/api/v1/churches/${slug.value}/scripts/${serviceId.value}/export`)
</script>

<template>
  <section class="stack-md w-760">
    <p
      v-if="error"
      class="panel panel--no"
    >
      {{ apiErrorMessage(error) }}
    </p>
    <template v-if="data">
      <div>
        <p
          class="eyebrow row"
          style="gap:8px"
        >
          <span
            v-if="liturgy.color"
            class="dot"
            :style="{ background: liturgicalHex(liturgy.color) ?? 'var(--muted)' }"
          />
          <span>{{ eyebrow || 'Roteiro do culto' }}</span>
          <span
            v-if="draftTag"
            class="tag tag--wait"
          >{{ draftTag }}</span>
        </p>
        <h1 class="h1--sm">
          Roteiro de {{ longDate(data.service.startsAt, tz) }}
        </h1>
        <p class="lede">
          {{ data.service.title }} · {{ time(data.service.startsAt, tz) }}<template v-if="data.service.location">
            · {{ data.service.location }}
          </template>
        </p>
      </div>

      <nav
        v-if="editor && (others?.length ?? 0) > 1"
        class="pills"
        aria-label="Outros cultos"
      >
        <NuxtLink
          v-for="o in others"
          :key="o.serviceId"
          :to="link(`/roteiros/${o.serviceId}`)"
          class="pill"
          :aria-current="o.serviceId === serviceId ? 'page' : undefined"
        >
          <span class="pill__wd">{{ weekdayShort(o.startsAt, tz) }}</span> {{ dayNumber(o.startsAt, tz) }}/{{ monthShort(o.startsAt, tz) }}
        </NuxtLink>
      </nav>

      <div
        v-if="editor && data.needsReview?.required"
        class="panel panel--wait"
        style="border-radius:18px"
      >
        <p class="strong">
          A escala mudou depois que o roteiro foi publicado
        </p>
        <p
          v-for="c in data.needsReview.changes"
          :key="c.blockTitle"
          class="small"
          style="margin-top:4px"
        >
          {{ c.blockTitle }}: {{ c.published.join(', ') || 'ninguém' }} → {{ c.current.join(', ') || 'ninguém' }}
        </p>
        <p
          class="small"
          style="margin-top:6px"
        >
          Publique de novo para atualizar o roteiro de todos.
        </p>
      </div>

      <!-- Edição: coordenação e pastores -->
      <template v-if="editor">
        <ScriptEditor
          v-if="data.draft && aux"
          :view="data"
          :service-id="serviceId"
          :people="aux.people"
          :songs="aux.songs"
          :scheduled="aux.scheduled"
          :can-publish="canPublish"
          :is-pastor="isPastor"
          @refresh="refresh"
        />
        <div
          v-else-if="!data.draft"
          class="card--dashed"
        >
          <template v-if="isCoordinator && templates && !templates.length">
            <p
              class="strong"
              style="font-size:18px"
            >
              Falta um modelo de liturgia
            </p>
            <p
              class="soft"
              style="margin:6px auto 0;max-width:420px"
            >
              O roteiro nasce do modelo da igreja: a ordem do culto e os textos fixos. Crie um para começar.
            </p>
            <NuxtLink
              :to="link('/coordenacao/modelos')"
              class="btn btn--md"
              style="margin-top:16px"
            >
              Criar modelo de liturgia
            </NuxtLink>
          </template>
          <p
            v-else-if="isCoordinator"
            class="soft"
          >
            Preparando o roteiro…
          </p>
          <p
            v-else
            class="soft"
          >
            A coordenação ainda não começou o roteiro deste culto.
          </p>
        </div>
      </template>

      <!-- Leitura -->
      <template v-else>
        <div
          v-if="data.canChooseMusic && data.draft"
          class="card"
        >
          <h2
            class="h3"
            style="font-size:18px"
          >
            Músicas deste culto
          </h2>
          <p
            class="soft small"
            style="margin-top:2px"
          >
            Você prega neste culto: escolha as músicas e o louvor recebe o aviso.
          </p>
          <SongPicker
            v-model="preacherSongs"
            :songs="aux?.songs ?? []"
          />
          <button
            type="button"
            class="btn btn--soft btn--xs"
            style="margin-top:12px;min-height:42px;padding:8px 16px"
            :disabled="savingSongs || !preacherSongs.length"
            @click="savePreacherSongs"
          >
            Salvar músicas e avisar o louvor
          </button>
        </div>
        <ScriptReader
          v-if="content"
          :content="content"
        />
        <div
          v-else
          class="card--dashed"
        >
          <p
            class="strong"
            style="font-size:18px"
          >
            O roteiro ainda não foi publicado
          </p>
          <p
            class="soft"
            style="margin:6px auto 0;max-width:380px"
          >
            Assim que a coordenação publicar, ele aparece aqui.
          </p>
        </div>
      </template>

      <p
        v-if="data.published"
        class="row no-print"
        style="gap:6px 16px"
      >
        <a
          :href="`${exportBase}?format=html`"
          target="_blank"
          class="link"
        ><Icon name="print" />Imprimir</a>
        <a
          :href="`${exportBase}?format=txt`"
          class="link"
        ><Icon name="download" />Baixar em texto</a>
      </p>
    </template>
  </section>
</template>
