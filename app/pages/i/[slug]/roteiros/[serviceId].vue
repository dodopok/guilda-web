<script setup lang="ts">
import type { ScriptView } from '~/types'

useHead({ title: 'Roteiro' })
const route = useRoute()
const serviceId = String(route.params.serviceId)
const { capi, tz, link, slug, isPastor } = useChurch()
const toast = useToast()
const { data, refresh, error } = await useAsyncData(`script-${serviceId}`, () => capi<ScriptView>(`/scripts/${serviceId}`))
const content = computed(() => data.value?.published?.content ?? null)
const liturgy = computed(() => content.value?.liturgy ?? data.value?.draft?.liturgy ?? {})
const musicBlock = computed(() => data.value?.draft?.blocks.find((b) => b.type === 'music'))
const pastoralNote = ref('')
watchEffect(() => { pastoralNote.value = data.value?.draft?.pastoralNote ?? '' })
async function saveNote() {
  try {
    await capi(`/scripts/${serviceId}`, { method: 'PATCH', body: { pastoralNote: pastoralNote.value || null } })
    toast.ok('Observação registrada para a coordenação.')
  } catch (e) {
    toast.error(e)
  }
}
const exportBase = computed(() => `/api/v1/churches/${slug.value}/scripts/${serviceId}/export`)
</script>

<template>
  <div class="page">
    <p
      class="no-print"
      style="margin-bottom:1rem"
    >
      <NuxtLink :to="link('/roteiros')"><Icon
        name="arrow-left"
        style="width:1rem;height:1rem;vertical-align:-.15em"
      /> Roteiros</NuxtLink>
    </p>
    <p
      v-if="error"
      class="notice notice--no"
    >
      {{ apiErrorMessage(error) }}
    </p>
    <template v-if="data">
      <header class="page-head">
        <p class="kicker">
          {{ [liturgy.sundayName, liturgy.celebration].filter(Boolean).join(' · ') || 'Roteiro do culto' }}
        </p>
        <h1>{{ content?.title ?? data.service.title }}</h1>
        <p class="lede">
          {{ longDate(data.service.startsAt, tz) }}, às {{ time(data.service.startsAt, tz) }}<template v-if="data.service.location">
            · {{ data.service.location }}
          </template>
        </p>
        <p
          v-if="liturgy.color"
          class="row"
          style="margin-top:.5rem;gap:.5rem"
        >
          <span
            aria-hidden="true"
            :style="`display:inline-block;width:.9rem;height:.9rem;border-radius:2px;background:var(--accent)`"
          />
          <span class="ink-2">Cor litúrgica: {{ liturgy.color }}</span>
        </p>
        <div
          class="row no-print"
          style="margin-top:1rem"
        >
          <template v-if="data.published">
            <a
              class="btn btn--small"
              :href="`${exportBase}?format=html`"
              target="_blank"
              rel="noopener"
            ><Icon name="print" /> Versão para imprimir</a>
            <a
              class="btn btn--small"
              :href="`${exportBase}?format=txt`"
            ><Icon name="download" /> Baixar texto</a>
          </template>
          <NuxtLink
            v-if="data.canEdit"
            class="btn btn--small"
            :to="link(`/coordenacao/roteiros/${serviceId}`)"
          ><Icon name="edit" /> Editar</NuxtLink>
        </div>
      </header>

      <div
        v-if="data.needsReview?.required && data.canEdit"
        class="notice notice--wait no-print"
        style="margin-bottom:1.5rem"
      >
        <h3>A escala mudou depois da publicação</h3>
        <p
          v-for="(c, i) in data.needsReview.changes"
          :key="i"
        >
          {{ c.blockTitle }}: publicado com {{ c.published.join(', ') || 'ninguém' }}, agora {{ c.current.join(', ') || 'ninguém' }}.
        </p>
        <div class="row">
          <NuxtLink
            class="btn btn--small"
            :to="link(`/coordenacao/roteiros/${serviceId}`)"
          >Revisar e publicar de novo</NuxtLink>
        </div>
      </div>

      <section
        v-if="data.canChooseMusic && data.draft"
        class="section no-print"
        style="margin-top:0;margin-bottom:2rem"
      >
        <div class="section-head">
          <h2>Músicas deste culto</h2>
        </div>
        <p
          class="ink-2"
          style="margin:.5rem 0 1rem"
        >
          {{ data.draft.musicChooser === 'pastors' ? 'Neste culto os pastores escolhem as músicas.' : 'Quem prega escolhe as músicas. Depois de salvar, avise o louvor.' }}
        </p>
        <MusicChooser
          :service-id="serviceId"
          :selected="musicBlock?.songs ?? []"
          :block-id="musicBlock?.id"
          @saved="refresh"
        />
      </section>

      <section
        v-if="isPastor && data.draft"
        class="section no-print"
        style="margin-top:0;margin-bottom:2rem"
      >
        <div class="section-head">
          <h2>Revisão pastoral</h2>
        </div>
        <p
          class="ink-2"
          style="margin:.5rem 0 .75rem"
        >
          Deixe observações para a coordenação. A revisão é informal e não bloqueia a publicação.
        </p>
        <textarea
          v-model="pastoralNote"
          class="textarea"
          aria-label="Observação pastoral"
        />
        <button
          type="button"
          class="btn btn--small"
          style="margin-top:.5rem"
          @click="saveNote"
        >
          Salvar observação
        </button>
      </section>

      <ScriptReader
        v-if="content"
        :content="content"
        :tz="tz"
      />
      <EmptyState
        v-else
        title="O roteiro ainda não foi publicado"
        text="Quando a coordenação publicar, ele aparece aqui para leitura no celular."
      />
      <p
        v-if="data.published"
        class="muted small"
        style="margin-top:1.5rem"
      >
        Versão {{ data.published.version }}, publicada em {{ dateTime(data.published.publishedAt, tz) }}.
        <template v-if="content?.liturgicalSource.source === 'estevao'">
          Dados litúrgicos do Estêvão ({{ content.liturgicalSource.prayerBook }}), consultados em {{ dateTime(content.liturgicalSource.fetchedAt!, tz) }}.
        </template>
      </p>
    </template>
  </div>
</template>
