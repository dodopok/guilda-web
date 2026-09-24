<script setup lang="ts">
import type { Song } from '~/types'
import { isCifraLink, type SongHit } from '~/composables/useSongSearch'

useHead({ title: 'Repertório' })
const route = useRoute()
const { capi, link } = useChurch()
const toast = useToast()
const { data, refresh } = await useAsyncData(`repo-${route.params.slug}`, () => capi<{ songs: Song[] }>('/songs'))
const q = ref('')
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
// Busca também no Cifra Club; a escolhida entra no repertório e o tom é lido da cifra, se der.
const { hits: rawHits, searching, note, adding, addHit: saveHit, reading, readKey: lookupKey } = useSongSearch(q)
const hits = computed(() => rawHits.value.filter((h) => !(data.value?.songs ?? []).some((s) => s.link === h.link)))
async function addHit(h: SongHit) {
  if (await saveHit(h)) {
    q.value = ''
    await refresh()
  }
}
async function readKey() {
  const s = editing.value
  if (!s?.id) return
  const song = await lookupKey(s as Song)
  if (song?.musicalKey) {
    form.musicalKey = song.musicalKey
    await refresh()
  }
}
const list = computed(() => (data.value?.songs ?? []).filter((s) => !q.value.trim() || norm(`${s.title} ${s.author ?? ''}`).includes(norm(q.value.trim()))))

const editing = ref<Partial<Song> | null>(null)
const form = reactive({ title: '', author: '', musicalKey: '', link: '', notes: '' })
const open = computed({ get: () => Boolean(editing.value), set: (v) => { if (!v) editing.value = null } })
function edit(s?: Song, title = '') {
  editing.value = s ?? {}
  Object.assign(form, { title: s?.title ?? title, author: s?.author ?? '', musicalKey: s?.musicalKey ?? '', link: s?.link ?? '', notes: s?.notes ?? '' })
}
const saving = ref(false)
async function save() {
  if (!form.title.trim()) {
    toast.error('Dê um título à música.')
    return
  }
  const body = { title: form.title, author: form.author || null, musicalKey: form.musicalKey || null, link: form.link || null, notes: form.notes || null }
  saving.value = true
  try {
    if (editing.value?.id) await capi(`/songs/${editing.value.id}`, { method: 'PATCH', body })
    else await capi('/songs', { method: 'POST', body })
    toast.ok('Música salva.')
    editing.value = null
    await refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="stack-lg w-760">
    <PageHead
      title="Repertório"
      lede="As músicas da igreja, prontas para entrar no roteiro."
      :back="link('/coordenacao/configuracoes')"
      back-label="Configurações"
    >
      <button
        type="button"
        class="btn btn--md"
        style="font-size:15px"
        @click="edit()"
      >
        <Icon
          name="plus"
          :weight="2.2"
          style="width:16px;height:16px"
        />Nova música
      </button>
    </PageHead>

    <input
      v-model="q"
      type="search"
      class="input"
      style="border-radius:14px"
      placeholder="Buscar no repertório ou no Cifra Club"
      aria-label="Buscar música"
    >

    <div class="card card--flush rows">
      <button
        v-for="s in list"
        :key="s.id"
        type="button"
        class="listrow"
        @click="edit(s)"
      >
        <span
          class="keybox"
          :aria-label="s.musicalKey ? `Tom ${s.musicalKey}` : undefined"
        >{{ s.musicalKey || '–' }}</span>
        <span style="flex:1;min-width:0">
          <span
            class="strong"
            style="display:block"
          >{{ s.title }}</span>
          <span
            v-if="s.author || s.notes"
            class="soft"
            style="display:block;font-size:13.5px"
          >{{ [s.author, s.notes].filter(Boolean).join(' · ') }}</span>
        </span>
        <span
          v-if="s.link"
          class="stag"
          style="background:#e3ebf8;color:#2f5fa8"
        >link</span>
        <Icon
          name="chevron-right"
          class="listrow__chev"
        />
      </button>
      <div
        v-if="!list.length"
        class="muted"
        style="padding:22px 16px;text-align:center"
      >
        <template v-if="q.trim()">
          Nada com esse nome no repertório.
          <button
            type="button"
            class="link"
            @click="edit(undefined, q.trim())"
          >
            Cadastrar “{{ q.trim() }}”
          </button>
        </template>
        <template v-else>
          Nenhuma música cadastrada ainda.
        </template>
      </div>
    </div>

    <section
      v-if="hits.length"
      aria-labelledby="cc-title"
    >
      <p
        id="cc-title"
        class="caps"
      >
        No Cifra Club
      </p>
      <div
        class="card card--flush rows"
        style="margin-top:6px"
      >
        <button
          v-for="h in hits"
          :key="h.link"
          type="button"
          class="listrow"
          :disabled="adding"
          @click="addHit(h)"
        >
          <span style="flex:1;min-width:0">
            <span
              class="strong"
              style="display:block"
            >{{ h.title }}</span>
            <span
              class="soft"
              style="display:block;font-size:13.5px"
            >{{ h.artist }}</span>
          </span>
          <span
            class="strong xsmall"
            style="color:var(--accent-deep)"
          >Adicionar ao repertório</span>
        </button>
      </div>
      <p
        class="xsmall muted"
        style="margin-top:6px"
      >
        Entra com título, artista e link da cifra. O tom original é lido da cifra quando o Cifra Club permite; senão, abra a música e digite.
      </p>
    </section>
    <p
      v-if="searching || note"
      class="muted small"
      role="status"
    >
      {{ searching ? 'Buscando no Cifra Club…' : note }}
    </p>

    <Sheet
      v-model:open="open"
      placement="right"
      :title="editing?.id ? 'Editar música' : 'Nova música'"
      lede="Sem letra — só o que ajuda o louvor a achar e tocar."
    >
      <form
        class="stack-md"
        novalidate
        @submit.prevent="save"
      >
        <label class="field"><span class="field__label">Título</span><input
          v-model="form.title"
          class="input"
          maxlength="200"
        ></label>
        <div
          class="row"
          style="gap:10px;flex-wrap:nowrap"
        >
          <label
            class="field"
            style="flex:1"
          ><span class="field__label">Autor ou origem</span><input
            v-model="form.author"
            class="input"
            placeholder="Ex.: Hinário"
            maxlength="200"
          ></label>
          <label
            class="field"
            style="width:112px"
          ><span class="field__label">Tom original</span><input
            v-model="form.musicalKey"
            class="input"
            style="text-align:center"
            placeholder="G"
            maxlength="20"
          ></label>
        </div>
        <button
          v-if="editing?.id && !form.musicalKey && isCifraLink(editing.link)"
          type="button"
          class="linkbtn"
          style="align-self:flex-start"
          :disabled="reading === editing.id"
          @click="readKey"
        >
          {{ reading === editing.id ? 'Lendo o tom…' : 'Ler tom original da cifra' }}
        </button>
        <label class="field"><span class="field__label">Link (YouTube, cifra, partitura)</span><input
          v-model="form.link"
          class="input"
          type="url"
          inputmode="url"
          placeholder="https://"
        ></label>
        <label class="field"><span class="field__label">Observações</span><textarea
          v-model="form.notes"
          class="textarea"
          style="min-height:70px;resize:vertical"
          placeholder="Ex.: tocar mais lenta; entrada só com voz"
          maxlength="1000"
        /></label>
        <button
          class="btn btn--block"
          :disabled="saving"
        >
          Salvar
        </button>
      </form>
    </Sheet>
  </div>
</template>
