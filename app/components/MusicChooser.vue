<script setup lang="ts">
import type { Song } from '~/types'

// Escolha das músicas do culto por quem prega (ou pastores/coordenação).
const props = defineProps<{ serviceId: string, selected: Song[], blockId?: string }>()
const emit = defineEmits<{ (e: 'saved'): void }>()
const { capi } = useChurch()
const toast = useToast()
const { data: repo, refresh: refreshRepo } = await useAsyncData(`songs-${props.serviceId}`, () => capi<{ songs: Song[] }>('/songs'))
const list = ref<Song[]>([...props.selected])
watch(() => props.selected, (v) => { list.value = [...v] })
const query = ref('')
const matches = computed(() => {
  const q = query.value.trim().toLowerCase()
  const chosen = new Set(list.value.map((s) => s.id))
  return (repo.value?.songs ?? []).filter((s) => !chosen.has(s.id) && (!q || s.title.toLowerCase().includes(q) || (s.author ?? '').toLowerCase().includes(q))).slice(0, 8)
})
const dirty = computed(() => list.value.map((s) => s.id).join() !== props.selected.map((s) => s.id).join())
function move(i: number, d: number) {
  const next = [...list.value]
  const [x] = next.splice(i, 1)
  next.splice(i + d, 0, x!)
  list.value = next
}
const saving = ref(false)
async function save() {
  saving.value = true
  try {
    await capi(`/scripts/${props.serviceId}/music`, { method: 'PUT', body: { blockId: props.blockId, songIds: list.value.map((s) => s.id) } })
    toast.ok('Músicas salvas.')
    emit('saved')
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}
const notifying = ref(false)
async function notify() {
  notifying.value = true
  try {
    const r = await capi<{ recipients: number, queued: number, blocked: number }>(`/scripts/${props.serviceId}/music/notify`, { method: 'POST' })
    toast.ok(r.recipients ? `Aviso para ${r.recipients} ${r.recipients === 1 ? 'pessoa' : 'pessoas'} do louvor${r.blocked ? ` (${r.blocked} sem WhatsApp autorizado)` : ''}.` : 'Ninguém do louvor está escalado neste culto.')
  } catch (e) {
    toast.error(e)
  } finally {
    notifying.value = false
  }
}
const adding = ref(false)
const newSong = reactive({ title: '', musicalKey: '', link: '' })
async function create() {
  try {
    const { song } = await capi<{ song: Song }>('/songs', { method: 'POST', body: { title: newSong.title, musicalKey: newSong.musicalKey || null, link: newSong.link || null } })
    list.value = [...list.value, song]
    Object.assign(newSong, { title: '', musicalKey: '', link: '' })
    adding.value = false
    await refreshRepo()
  } catch (e) {
    toast.error(e)
  }
}
</script>

<template>
  <div>
    <ol
      v-if="list.length"
      class="lines"
      style="padding:0;list-style:none"
    >
      <li
        v-for="(s, i) in list"
        :key="s.id"
        class="line"
      >
        <span class="line__main">
          <span class="line__title">{{ s.title }}</span>
          <span class="line__sub"> {{ [s.author, s.musicalKey && `tom ${s.musicalKey}`].filter(Boolean).join(' · ') }}</span>
        </span>
        <span
          class="row"
          style="gap:.25rem"
        >
          <button
            type="button"
            class="btn btn--icon btn--small"
            :disabled="i === 0"
            :aria-label="`Subir ${s.title}`"
            @click="move(i, -1)"
          ><Icon name="up" /></button>
          <button
            type="button"
            class="btn btn--icon btn--small"
            :disabled="i === list.length - 1"
            :aria-label="`Descer ${s.title}`"
            @click="move(i, 1)"
          ><Icon name="down" /></button>
          <button
            type="button"
            class="btn btn--icon btn--small btn--no"
            :aria-label="`Tirar ${s.title}`"
            @click="list = list.filter((x) => x.id !== s.id)"
          ><Icon name="x" /></button>
        </span>
      </li>
    </ol>
    <p
      v-else
      class="muted"
    >
      Nenhuma música escolhida ainda.
    </p>
    <div
      class="field"
      style="margin-top:1rem"
    >
      <label
        class="field__label"
        :for="`song-q-${serviceId}`"
      >Adicionar do repertório</label>
      <input
        :id="`song-q-${serviceId}`"
        v-model="query"
        class="input"
        placeholder="Buscar por título ou autor"
      >
    </div>
    <ul
      v-if="query || matches.length"
      class="lines lines--tight"
    >
      <li
        v-for="s in matches"
        :key="s.id"
        class="line"
      >
        <span class="line__main">{{ s.title }} <span class="muted small">{{ s.musicalKey ? `· ${s.musicalKey}` : '' }}</span></span>
        <button
          type="button"
          class="btn btn--small"
          @click="list = [...list, s]; query = ''"
        >
          <Icon name="plus" /> Incluir
        </button>
      </li>
      <li
        v-if="!matches.length"
        class="muted small"
      >
        Nada encontrado no repertório.
      </li>
    </ul>
    <button
      v-if="!adding"
      type="button"
      class="btn btn--quiet btn--small"
      style="margin-top:.5rem"
      @click="adding = true"
    >
      Cadastrar música nova
    </button>
    <form
      v-else
      class="stack-sm"
      style="margin-top:.75rem"
      @submit.prevent="create"
    >
      <div class="fields-2">
        <label class="field"><span class="field__label">Título</span><input
          v-model="newSong.title"
          class="input"
          required
        ></label>
        <label class="field"><span class="field__label">Tom</span><input
          v-model="newSong.musicalKey"
          class="input"
          placeholder="Ex.: D"
        ></label>
      </div>
      <label class="field"><span class="field__label">Link (cifra, vídeo)</span><input
        v-model="newSong.link"
        class="input"
        type="url"
        placeholder="https://"
      ></label>
      <div class="row">
        <button class="btn btn--small">
          Cadastrar e incluir
        </button><button
          type="button"
          class="btn btn--quiet btn--small"
          @click="adding = false"
        >
          Cancelar
        </button>
      </div>
    </form>
    <div
      class="row"
      style="margin-top:1.25rem"
    >
      <button
        type="button"
        class="btn btn--primary"
        :disabled="!dirty || saving"
        @click="save"
      >
        Salvar músicas
      </button>
      <button
        type="button"
        class="btn"
        :disabled="dirty || !selected.length || notifying"
        :title="dirty ? 'Salve antes de avisar' : undefined"
        @click="notify"
      >
        <Icon name="send" /> Avisar o louvor
      </button>
    </div>
  </div>
</template>
