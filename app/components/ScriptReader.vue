<script setup lang="ts">
import type { PublishedBlock, PublishedContent } from '~/types'
import { plainRichText } from '#shared/liturgy'

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
  const rich = b.type === 'rite' || b.type === 'collect' || b.type === 'text'
  const long = rich && plainRichText(text).length > 180
  return { ...b, text, rich, long, who: b.type === 'psalm' && !b.responsibles.length ? 'todos' : b.responsibles.map((r) => r.name).join(', ') }
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
      <!-- Leituras: anúncio, referência e resposta de todos (em negrito). -->
      <div
        v-if="b.type === 'reading' || b.type === 'psalm'"
        class="richtext"
        style="margin-top:8px"
      >
        <template v-if="b.responses?.open">
          <p>{{ b.responses.open.leader }}</p>
          <p v-if="b.responses.open.people">
            <strong>Todos: {{ b.responses.open.people }}</strong>
          </p>
        </template>
        <p class="strong">
          {{ b.text }}
        </p>
        <template v-if="b.responses?.close">
          <p>{{ b.responses.close.leader }}</p>
          <p v-if="b.responses.close.people">
            <strong>Todos: {{ b.responses.close.people }}</strong>
          </p>
        </template>
      </div>
      <template v-else-if="b.text">
        <RichText
          v-if="b.rich"
          :text="b.text"
          class="prose"
          :class="{ 'richtext--clamp': b.long && !open.has(b.id) }"
          style="margin-top:8px"
        />
        <p
          v-else
          class="prose"
          style="margin-top:8px;white-space:pre-line"
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
