<script setup lang="ts">
import type { Song } from '~/types'

useHead({ title: 'Repertório' })
const route = useRoute()
const { capi, link } = useChurch()
const toast = useToast()
const { data, refresh } = await useAsyncData(`repo-${route.params.slug}`, () => capi<{ songs: Song[] }>('/songs'))
const q = ref('')
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
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
      placeholder="Buscar por título ou autor"
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
          Nada com esse nome.
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

    <Sheet
      v-model:open="open"
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
