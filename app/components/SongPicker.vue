<script setup lang="ts">
import type { Song } from '~/types'

// Escolha de músicas: sugere do repertório da igreja e busca no Cifra Club. A música
// escolhida pela busca entra no repertório (título, artista e link). O tom deste culto
// pode mudar na hora; sem mudança, vale o tom original do repertório.
const props = defineProps<{ modelValue: string[], keys?: Record<string, string>, songs: Song[] }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: string[]): void
  (e: 'update:keys', v: Record<string, string>): void
}>()
const { capi } = useChurch()
const toast = useToast()

// Músicas criadas ou alteradas aqui, até o repertório ser recarregado.
const local = ref<Song[]>([])
const all = computed(() => [...local.value, ...props.songs.filter((s) => !local.value.some((l) => l.id === s.id))])
const byId = (id: string) => all.value.find((s) => s.id === id)
const chosen = computed(() => props.modelValue.map(byId).filter((s): s is Song => Boolean(s)))

const query = ref('')
const q = computed(() => query.value.trim().toLowerCase())
const results = computed(() => (q.value
  ? all.value.filter((s) => !props.modelValue.includes(s.id) && (s.title.toLowerCase().includes(q.value) || (s.author ?? '').toLowerCase().includes(q.value))).slice(0, 5)
  : []))

interface Hit { title: string, artist: string, link: string }
const hits = ref<Hit[]>([])
const searching = ref(false)
const searchNote = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0
watch(q, () => {
  clearTimeout(timer)
  hits.value = []
  searchNote.value = ''
  const v = query.value.trim()
  if (v.length < 3) return
  timer = setTimeout(async () => {
    const mine = ++seq
    searching.value = true
    try {
      const r = await capi<{ available: boolean, reason?: string, hits: Hit[] }>(`/songs/search?q=${encodeURIComponent(v)}`)
      if (mine !== seq) return
      hits.value = r.hits.filter((h) => !all.value.some((s) => s.link === h.link && props.modelValue.includes(s.id)))
      if (!r.available) searchNote.value = 'A busca no Cifra Club não respondeu agora. O repertório continua disponível.'
    } catch {
      if (mine === seq) searchNote.value = 'A busca no Cifra Club não respondeu agora. O repertório continua disponível.'
    } finally {
      if (mine === seq) searching.value = false
    }
  }, 400)
})
onBeforeUnmount(() => clearTimeout(timer))

function add(id: string) {
  emit('update:modelValue', [...props.modelValue, id])
  query.value = ''
}
const adding = ref(false)
async function addHit(h: Hit) {
  adding.value = true
  try {
    const r = await capi<{ song: Song }>('/songs', { method: 'POST', body: { title: h.title, author: h.artist, link: h.link } })
    local.value = [r.song, ...local.value.filter((s) => s.id !== r.song.id)]
    add(r.song.id)
  } catch (e) {
    toast.error(e)
  } finally {
    adding.value = false
  }
}
function remove(id: string) {
  emit('update:modelValue', props.modelValue.filter((x) => x !== id))
  if (props.keys?.[id] !== undefined) {
    const next = { ...props.keys }
    Reflect.deleteProperty(next, id)
    emit('update:keys', next)
  }
}

const keyOf = (id: string) => props.keys?.[id] ?? ''
function setKey(id: string, v: string) {
  const next = { ...(props.keys ?? {}) }
  if (v.trim()) next[id] = v.trim().slice(0, 20)
  else Reflect.deleteProperty(next, id)
  emit('update:keys', next)
}
// Sem tom original no repertório: guarda o que foi digitado como original.
async function saveOriginal(s: Song) {
  const k = keyOf(s.id)
  if (!k) return
  try {
    const r = await capi<{ song: Song }>(`/songs/${s.id}`, { method: 'PATCH', body: { musicalKey: k } })
    local.value = [r.song, ...local.value.filter((x) => x.id !== s.id)]
    toast.ok(`Tom original de “${s.title}” guardado no repertório.`)
  } catch (e) {
    toast.error(e)
  }
}
const KEYS = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const listId = `song-keys-${useId()}`
const origLine = (s: Song) => [s.author, s.musicalKey ? `original ${s.musicalKey}` : 'tom original não informado'].filter(Boolean).join(' · ')
const isCifra = (link: string | null) => Boolean(link && /^https:\/\/www\.cifraclub\.com\.br\//.test(link))
</script>

<template>
  <div>
    <p
      class="soft small"
      style="margin:4px 0 10px"
    >
      Busque no repertório ou no Cifra Club e toque para adicionar. O tom pode mudar só para este culto.
    </p>
    <datalist :id="listId">
      <option
        v-for="k in [...KEYS, ...KEYS.map((x) => `${x}m`)]"
        :key="k"
        :value="k"
      />
    </datalist>
    <div
      class="stack-sm"
      style="gap:6px"
    >
      <div
        v-for="(s, i) in chosen"
        :key="s.id"
        class="songrow"
      >
        <span
          class="av av--sm"
          style="width:24px;height:24px;font-size:12px;color:var(--ink-2);flex:none"
        >{{ i + 1 }}</span>
        <span
          class="grow"
          style="min-width:0"
        >
          <span style="display:block;font-weight:700;font-size:15px">{{ s.title }}</span>
          <span
            class="xsmall muted"
            style="display:block"
          >{{ origLine(s) }}</span>
          <span
            v-if="s.link || (!s.musicalKey && keyOf(s.id))"
            class="row xsmall"
            style="gap:12px;margin-top:2px"
          >
            <a
              v-if="s.link"
              :href="s.link"
              target="_blank"
              rel="noopener noreferrer"
              class="strong"
              style="color:var(--accent-deep)"
            >{{ isCifra(s.link) ? 'Abrir cifra' : 'Abrir link' }}<span class="sr-only"> de {{ s.title }} (abre em outra aba)</span></a>
            <button
              v-if="!s.musicalKey && keyOf(s.id)"
              type="button"
              class="linkbtn"
              @click="saveOriginal(s)"
            >Guardar {{ keyOf(s.id) }} como tom original</button>
          </span>
        </span>
        <label class="songrow__key">
          <span class="xsmall muted">Tom</span>
          <input
            :value="keyOf(s.id)"
            class="input"
            :list="listId"
            maxlength="20"
            autocomplete="off"
            :placeholder="s.musicalKey ?? '—'"
            :aria-label="`Tom de ${s.title} neste culto`"
            @change="setKey(s.id, ($event.target as HTMLInputElement).value)"
          >
        </label>
        <button
          type="button"
          class="icon-btn icon-btn--sm"
          style="background:#fff;width:32px;height:32px;flex:none"
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
        :for="`song-q-${listId}`"
      >Buscar música</label>
      <input
        :id="`song-q-${listId}`"
        v-model="query"
        type="search"
        class="input"
        style="min-height:46px;padding:10px 14px;font-size:15.5px"
        placeholder="Buscar música ou artista…"
        autocomplete="off"
      >
      <div
        v-if="results.length"
        style="margin-top:8px"
      >
        <p class="caps">
          No repertório
        </p>
        <div
          class="card card--flush list"
          style="margin-top:4px;border-radius:14px"
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
              class="xsmall muted"
              style="display:block"
            >{{ [s.author, s.musicalKey && `tom ${s.musicalKey}`].filter(Boolean).join(' · ') }}</span></span>
            <span
              class="strong xsmall"
              style="color:var(--accent-deep)"
            >Adicionar</span>
          </button>
        </div>
      </div>
      <div
        v-if="hits.length"
        style="margin-top:8px"
      >
        <p class="caps">
          No Cifra Club
        </p>
        <div
          class="card card--flush list"
          style="margin-top:4px;border-radius:14px"
        >
          <button
            v-for="h in hits"
            :key="h.link"
            type="button"
            class="listrow"
            style="padding:10px 12px"
            :disabled="adding"
            @click="addHit(h)"
          >
            <span class="grow"><span
              style="display:block;font-weight:700;font-size:15px"
            >{{ h.title }}</span><span
              class="xsmall muted"
              style="display:block"
            >{{ h.artist }}</span></span>
            <span
              class="strong xsmall"
              style="color:var(--accent-deep)"
            >Adicionar</span>
          </button>
        </div>
        <p
          class="xsmall muted"
          style="margin-top:4px"
        >
          A música entra no repertório com o link da cifra. O tom original fica na cifra: abra e digite no campo Tom.
        </p>
      </div>
      <p
        v-if="searching"
        class="muted"
        role="status"
        style="margin-top:8px;font-size:13.5px"
      >
        Buscando no Cifra Club…
      </p>
      <p
        v-else-if="searchNote"
        class="muted"
        role="status"
        style="margin-top:8px;font-size:13.5px"
      >
        {{ searchNote }}
      </p>
      <p
        v-else-if="q.length >= 3 && !results.length && !hits.length"
        class="muted"
        style="margin-top:8px;font-size:13.5px"
      >
        Nada com esse nome. Tente outra palavra.
      </p>
    </div>
  </div>
</template>
