<script setup lang="ts">
import type { PublishedBlock, PublishedContent } from '~/types'

// Leitura do roteiro publicado, pensada para o celular: quem faz o quê, textos
// recolhidos (toque para ver inteiro), leituras, músicas e avisos.
const props = defineProps<{ content: PublishedContent }>()
const open = ref<Set<string>>(new Set())
function toggle(id: string) {
  const next = new Set(open.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  open.value = next
}
const KIND: Record<string, string> = { rite: 'Rito', collect: 'Coleta', music: 'Louvor', reading: 'Leitura', psalm: 'Salmo', sermon: 'Sermão', announcements: 'Avisos', text: 'Texto', heading: '' }
function body(b: PublishedBlock) {
  if (b.type === 'reading' || b.type === 'psalm') return b.reference ?? b.body ?? ''
  if (b.type === 'music') return b.songs.length ? b.songs.map((s) => (s.musicalKey ? `${s.title} (${s.musicalKey})` : s.title)).join(' · ') : 'Ainda sem músicas escolhidas'
  if (b.type === 'announcements') return b.items.map((i) => i.text).join('\n')
  if (b.type === 'sermon') return b.reference ? `Texto base: ${b.reference}` : b.body ?? ''
  return b.body ?? ''
}
const blocks = computed(() => props.content.blocks.map((b) => {
  const text = body(b)
  const long = (b.type === 'rite' || b.type === 'collect' || b.type === 'text') && text.length > 180
  return { ...b, text, long, who: b.type === 'psalm' && !b.responsibles.length ? 'todos' : b.responsibles.map((r) => r.name).join(', ') }
}))
</script>

<template>
  <ol
    class="stack-sm"
    style="list-style:none;margin:0;padding:0"
  >
    <li
      v-for="b in blocks"
      :key="b.id"
      class="card"
      style="border-radius:18px"
    >
      <div
        class="row"
        style="align-items:baseline"
      >
        <span
          v-if="KIND[b.type]"
          class="caps"
          style="font-size:11.5px;min-width:60px"
        >{{ KIND[b.type] }}</span>
        <h3
          class="grow"
          style="font-size:17px"
        >
          {{ b.title }}
        </h3>
        <span
          v-if="b.who"
          style="font-size:13.5px;font-weight:700;color:var(--accent-deep)"
        >{{ b.who }}</span>
      </div>
      <template v-if="b.text">
        <p
          class="prose"
          :class="{ clamp3: b.long && !open.has(b.id) }"
          style="margin-top:8px"
        >
          {{ b.text }}
        </p>
        <button
          v-if="b.long"
          type="button"
          class="link link--ink"
          style="margin-top:6px;padding:4px 0"
          :aria-expanded="open.has(b.id)"
          @click="toggle(b.id)"
        >
          {{ open.has(b.id) ? 'Ver menos' : 'Ver texto completo' }}
        </button>
      </template>
    </li>
  </ol>
</template>
