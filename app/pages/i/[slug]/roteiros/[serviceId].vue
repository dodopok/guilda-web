<script setup lang="ts">
import type { ScriptView, Song, Task } from '~/types'

useHead({ title: 'Roteiro' })
const route = useRoute()
const serviceId = computed(() => String(route.params.serviceId))
const { capi, tz, link, slug, info, isCoordinator, isPastor } = useChurch()
const { memberships } = useSession()
const myName = computed(() => memberships.value.find((m) => m.slug === slug.value)?.displayName ?? '')
const toast = useToast()

const { data, refresh, error } = await useAsyncData(() => `script-${serviceId.value}`, () => capi<ScriptView>(`/scripts/${serviceId.value}`), { watch: [serviceId] })
const editor = computed(() => Boolean(data.value?.canEdit))
const canPublish = computed(() => Boolean(data.value?.canPublish))

// Sem roteiro: a coordenação começa pelo modelo do tipo do culto.
interface TemplateRow { id: string, name: string, kind: string, archived: boolean, blockCount: number }
const templates = ref<TemplateRow[] | null>(null)
const creating = ref(false)
async function ensureScript() {
  if (!data.value || data.value.draft || !isCoordinator.value || creating.value) return
  templates.value = (await capi<{ templates: TemplateRow[] }>('/templates')).templates.filter((t) => !t.archived)
  // Modelo vazio (recém-criado) não serve de base: gera um roteiro sem blocos.
  const usable = templates.value.filter((x) => x.blockCount > 0)
  const t = usable.find((x) => x.kind === data.value!.service.kind) ?? usable[0]
  if (!t) return
  creating.value = true
  try {
    await capi(`/scripts/${serviceId.value}`, { method: 'POST', body: { templateId: t.id } })
    // Busca direto: um refresh() enquanto a página ainda carrega pode ser descartado.
    data.value = await capi<ScriptView>(`/scripts/${serviceId.value}`)
  } catch (e) {
    toast.error(e)
  } finally {
    creating.value = false
  }
}
// Reage também ao papel chegar depois (a casca carrega a igreja em paralelo).
watch([() => data.value?.service.id, isCoordinator], ensureScript, { immediate: true })

// Apoio ao editor: pessoas (quem lê), repertório e escala deste culto.
interface PubMonth { services: { id: string, slots: { dutyId: string, dutyName: string, people: { personId: string, status: string }[] }[] }[] }
const { data: aux } = await useAsyncData(() => `script-aux-${serviceId.value}`, async () => {
  if (!data.value || !(data.value.canEdit || data.value.canChooseMusic)) return null
  const month = data.value.service.localDate.slice(0, 7)
  const [people, songs, pub] = await Promise.all([
    capi<{ people: { id: string, displayName: string, dutyIds: string[], roles: string[], status?: string }[] }>('/people'),
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
const { data: myTasks } = await useAsyncData(`script-my-tasks-${serviceId.value}`, () => capi<{ tasks: Task[] }>('/me/tasks?past=1').catch(() => ({ tasks: [] })), { watch: [serviceId] })
const myTask = computed(() => myTasks.value?.tasks.find((task) => task.service.id === data.value?.service.id) ?? null)
const myArrival = computed(() => myTask.value?.arrivalAt ? time(myTask.value.arrivalAt, tz.value) : null)
const myLocation = computed(() => myTask.value?.service.location ?? info.value?.church.defaultLocation ?? null)
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
const preacherKeys = ref<Record<string, string>>({})
watchEffect(() => {
  const music = data.value?.draft?.blocks.find((b) => b.type === 'music')
  preacherSongs.value = music?.data.songIds ?? []
  preacherKeys.value = music?.data.songKeys ?? {}
})
const savingSongs = ref(false)
async function savePreacherSongs() {
  savingSongs.value = true
  try {
    await capi(`/scripts/${serviceId.value}/music`, { method: 'PUT', body: { songIds: preacherSongs.value, songKeys: preacherKeys.value } })
    const r = await capi<{ recipients: number }>(`/scripts/${serviceId.value}/music/notify`, { method: 'POST' })
    toast.ok(r.recipients ? `Músicas salvas. ${plural(r.recipients, 'pessoa do louvor recebe', 'pessoas do louvor recebem')} o aviso.` : 'Músicas salvas.')
    await refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    savingSongs.value = false
  }
}
// "Clara entrou no Salmo no lugar de Davi."
function staleLine(c: { blockTitle: string, published: string[], current: string[] }) {
  const inn = c.current.filter((n) => !c.published.includes(n))
  const out = c.published.filter((n) => !c.current.includes(n))
  if (inn.length && out.length) return `${inn.join(' e ')} ${inn.length > 1 ? 'entraram' : 'entrou'} em ${c.blockTitle} no lugar de ${out.join(' e ')}.`
  if (inn.length) return `${inn.join(' e ')} ${inn.length > 1 ? 'entraram' : 'entrou'} em ${c.blockTitle}.`
  if (out.length) return `${out.join(' e ')} ${out.length > 1 ? 'saíram' : 'saiu'} de ${c.blockTitle}.`
  return ''
}
const republishing = ref(false)
async function republish() {
  republishing.value = true
  try {
    const r = await capi<{ version: number }>(`/scripts/${serviceId.value}/publish`, { method: 'POST' })
    toast.ok(`Roteiro atualizado (versão ${r.version}).`)
    await refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    republishing.value = false
  }
}
const exportBase = computed(() => `/api/v1/churches/${slug.value}/scripts/${serviceId.value}/export`)
</script>

<template>
  <section class="stack-md script-page">
    <p
      v-if="error"
      class="panel panel--no"
    >
      {{ apiErrorMessage(error) }}
    </p>
    <template v-if="data">
      <nav
        v-if="editor && (others?.length ?? 0) > 1"
        class="pills"
        style="margin-bottom:-4px"
        aria-label="Outros cultos"
      >
        <NuxtLink
          v-for="o in others"
          :key="o.serviceId"
          :to="link(`/roteiros/${o.serviceId}`)"
          class="pill"
          style="border-radius:999px;min-height:36px;padding:6px 12px;font-size:13.5px"
          :aria-current="o.serviceId === serviceId ? 'page' : undefined"
        >
          <span class="pill__wd">{{ weekdayShort(o.startsAt, tz) }}</span> {{ dayNumber(o.startsAt, tz) }}/{{ monthShort(o.startsAt, tz) }}
        </NuxtLink>
      </nav>
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
      <p
        v-if="data.published && !editor"
        class="row no-print"
        style="gap:6px 16px"
      >
        <a
          :href="`${exportBase}?format=html`"
          target="_blank"
          rel="noopener"
          class="link"
        ><Icon name="print" />Imprimir</a>
        <a
          :href="`${exportBase}?format=txt`"
          class="link"
        ><Icon name="download" />Baixar em texto</a>
      </p>

      <div
        v-if="editor && data.needsReview?.required"
        class="row"
        style="gap:12px;background:#fff1d6;border-radius:18px;padding:12px 16px"
        role="status"
      >
        <Icon
          name="alert"
          :weight="2"
          style="width:22px;height:22px;color:#a86400;flex:none"
        />
        <p style="flex:1;min-width:200px;color:#5c3a00;font-size:14.5px">
          <strong>A escala mudou depois de publicar.</strong>
          <template
            v-for="c in data.needsReview.changes"
            :key="c.blockTitle"
          >
            {{ ' ' }}{{ staleLine(c) }}
          </template>
        </p>
        <button
          v-if="canPublish"
          type="button"
          class="btn btn--white btn--sm"
          style="color:#5c3a00"
          :disabled="republishing"
          @click="republish"
        >
          Atualizar no roteiro
        </button>
      </div>

      <!-- Edição: coordenação e pastores -->
      <template v-if="editor">
        <ScriptTemplateBar
          v-if="data.draft && canPublish"
          :view="data"
          :service-id="serviceId"
          place="top"
          @refresh="refresh"
        />
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
        <ScriptTemplateBar
          v-if="data.draft && aux && canPublish"
          :view="data"
          :service-id="serviceId"
          place="bottom"
          @refresh="refresh"
        />
        <div
          v-else-if="!data.draft"
          class="card--dashed"
        >
          <template v-if="isCoordinator && templates && !templates.some((t) => t.blockCount > 0)">
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
              O roteiro nasce do modelo da igreja: a ordem do culto e os textos fixos. {{ templates.length ? 'Os modelos ainda estão vazios: acrescente os blocos para começar.' : 'Crie um para começar.' }}
            </p>
            <NuxtLink
              :to="link('/coordenacao/modelos')"
              class="btn btn--md"
              style="margin-top:16px"
            >
              {{ templates.length ? 'Abrir modelos de liturgia' : 'Criar modelo de liturgia' }}
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
            v-model:keys="preacherKeys"
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
          :my-name="myName"
          :arrival="myArrival"
          :location="myLocation"
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
    </template>
  </section>
</template>
