<script setup lang="ts">
import type { Song } from '~/types'

// Escolha de músicas do repertório: busca por título ou autor e toque para adicionar.
const props = defineProps<{ modelValue: string[], songs: Song[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string[]): void }>()
const query = ref('')
const chosen = computed(() => props.modelValue.map((id) => props.songs.find((s) => s.id === id)).filter((s): s is Song => Boolean(s)))
const q = computed(() => query.value.trim().toLowerCase())
const results = computed(() => (q.value
  ? props.songs.filter((s) => !props.modelValue.includes(s.id) && (s.title.toLowerCase().includes(q.value) || (s.author ?? '').toLowerCase().includes(q.value))).slice(0, 5)
  : []))
function add(id: string) {
  emit('update:modelValue', [...props.modelValue, id])
  query.value = ''
}
function remove(id: string) {
  emit('update:modelValue', props.modelValue.filter((x) => x !== id))
}
const meta = (s: Song) => [s.author, s.musicalKey && `tom ${s.musicalKey}`].filter(Boolean).join(' · ')
</script>

<template>
  <div>
    <p
      class="soft small"
      style="margin:4px 0 10px"
    >
      Busque e toque para adicionar.
    </p>
    <div
      class="stack-sm"
      style="gap:6px"
    >
      <div
        v-for="(s, i) in chosen"
        :key="s.id"
        class="row"
        style="flex-wrap:nowrap;padding:8px 10px;border-radius:12px;background:var(--surface-3)"
      >
        <span
          class="av av--sm"
          style="width:24px;height:24px;font-size:12px;color:var(--ink-2)"
        >{{ i + 1 }}</span>
        <span class="grow"><span
          style="display:block;font-weight:700;font-size:15px"
        >{{ s.title }}</span><span
          v-if="meta(s)"
          class="xsmall muted"
          style="display:block"
        >{{ meta(s) }}</span></span>
        <button
          type="button"
          class="icon-btn icon-btn--sm"
          style="background:#fff;width:32px;height:32px"
          :aria-label="`Tirar ${s.title}`"
          @click="remove(s.id)"
        >
          <Icon
            name="x"
            :weight="2.2"
          />
        </button>
      </div>
    </div>
    <div style="margin-top:10px">
      <label
        class="sr-only"
        :for="`song-q-${$.uid}`"
      >Buscar música</label>
      <input
        :id="`song-q-${$.uid}`"
        v-model="query"
        type="search"
        class="input"
        style="min-height:46px;padding:10px 14px;font-size:15.5px"
        placeholder="Buscar música ou autor…"
        autocomplete="off"
      >
      <div
        v-if="results.length"
        class="card card--flush list"
        style="margin-top:6px;border-radius:14px"
      >
        <button
          v-for="s in results"
          :key="s.id"
          type="button"
          class="listrow"
          style="padding:10px 12px"
          @click="add(s.id)"
        >
          <span class="grow"><span
            style="display:block;font-weight:700;font-size:15px"
          >{{ s.title }}</span><span
            v-if="meta(s)"
            class="xsmall muted"
            style="display:block"
          >{{ meta(s) }}</span></span>
          <span
            class="strong xsmall"
            style="color:var(--accent-deep)"
          >Adicionar</span>
        </button>
      </div>
      <p
        v-else-if="q"
        class="muted"
        style="margin-top:8px;font-size:13.5px"
      >
        Nada com esse nome. Tente outra palavra — ou peça à coordenação para cadastrar no repertório.
      </p>
    </div>
  </div>
</template>
