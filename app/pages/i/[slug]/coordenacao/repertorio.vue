<script setup lang="ts">
import type { Song } from '~/types'

useHead({ title: 'Repertório' })
const route = useRoute()
const { capi } = useChurch()
const toast = useToast()
const { data, refresh } = await useAsyncData(`repo-${route.params.slug}`, () => capi<{ songs: Song[] }>('/songs'))
const q = ref('')
const list = computed(() => (data.value?.songs ?? []).filter((s) => !q.value || `${s.title} ${s.author ?? ''}`.toLowerCase().includes(q.value.toLowerCase())))
const editing = ref<Partial<Song> | null>(null)
const form = reactive({ title: '', author: '', musicalKey: '', link: '', notes: '' })
const open = computed({ get: () => Boolean(editing.value), set: (v) => { if (!v) editing.value = null } })
function edit(s?: Song) {
  editing.value = s ?? {}
  Object.assign(form, { title: s?.title ?? '', author: s?.author ?? '', musicalKey: s?.musicalKey ?? '', link: s?.link ?? '', notes: s?.notes ?? '' })
}
async function save() {
  const body = { title: form.title, author: form.author || null, musicalKey: form.musicalKey || null, link: form.link || null, notes: form.notes || null }
  try {
    if (editing.value?.id) await capi(`/songs/${editing.value.id}`, { method: 'PATCH', body })
    else await capi('/songs', { method: 'POST', body })
    toast.ok('Música salva.')
    editing.value = null
    await refresh()
  } catch (e) {
    toast.error(e)
  }
}
</script>

<template>
  <div class="page">
    <NuxtLink
      :to="`/i/${$route.params.slug}/coordenacao/configuracoes`"
      class="back"
    >
      <Icon
        name="arrow-left"
        :weight="2"
      />Configurações
    </NuxtLink>
    <div class="page-head">
      <p class="kicker">
        Cadastro
      </p>
      <div class="row row--between">
        <h1>Repertório</h1>
        <button
          type="button"
          class="btn btn--primary"
          @click="edit()"
        >
          <Icon name="plus" /> Música
        </button>
      </div>
      <p class="lede">
        As músicas ficam no app. Letras não são copiadas: use o link para a cifra ou gravação.
      </p>
    </div>
    <label
      class="sr-only"
      for="song-search"
    >Buscar</label>
    <input
      id="song-search"
      v-model="q"
      class="input"
      type="search"
      placeholder="Buscar por título ou autor"
      style="max-width:22rem;margin-bottom:1rem"
    >
    <EmptyState
      v-if="!list.length"
      title="Nenhuma música"
    />
    <ul
      v-else
      class="lines"
    >
      <li
        v-for="s in list"
        :key="s.id"
        class="line"
      >
        <span class="line__main">
          <span class="line__title">{{ s.title }}</span>
          <span
            class="line__sub"
            style="display:block"
          >{{ [s.author, s.musicalKey && `tom ${s.musicalKey}`].filter(Boolean).join(' · ') || '—' }}</span>
        </span>
        <a
          v-if="s.link"
          :href="s.link"
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn--quiet btn--small"
        ><Icon name="external" /> Abrir</a>
        <button
          type="button"
          class="btn btn--small"
          @click="edit(s)"
        >
          Editar
        </button>
      </li>
    </ul>
    <Sheet
      v-model:open="open"
      :title="editing?.id ? form.title : 'Nova música'"
    >
      <form
        id="song-form"
        @submit.prevent="save"
      >
        <label class="field"><span class="field__label">Título</span><input
          v-model="form.title"
          class="input"
          required
        ></label>
        <div
          class="fields-2"
          style="margin-top:1.1rem"
        >
          <label class="field"><span class="field__label">Autor</span><input
            v-model="form.author"
            class="input"
          ></label>
          <label class="field"><span class="field__label">Tom</span><input
            v-model="form.musicalKey"
            class="input"
          ></label>
        </div>
        <label
          class="field"
          style="margin-top:1.1rem"
        ><span class="field__label">Link</span><input
          v-model="form.link"
          class="input"
          type="url"
          placeholder="https://"
        ></label>
        <label class="field"><span class="field__label">Observações</span><input
          v-model="form.notes"
          class="input"
        ></label>
      </form>
      <template #foot>
        <button
          type="button"
          class="btn"
          @click="editing = null"
        >
          Cancelar
        </button>
        <button
          type="submit"
          form="song-form"
          class="btn btn--primary"
        >
          Salvar
        </button>
      </template>
    </Sheet>
  </div>
</template>
