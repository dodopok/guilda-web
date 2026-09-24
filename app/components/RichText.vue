<script setup lang="ts">
import { parseRichText } from '#shared/liturgy'

// Mostra o texto formatado dos ritos (negrito e rubrica) sem v-html.
const props = defineProps<{ text: string | null | undefined }>()
const lines = computed(() => parseRichText(props.text))
</script>

<template>
  <div class="richtext">
    <p
      v-for="(l, i) in lines"
      :key="i"
      :class="{ rubric: l.rubric }"
    >
      <template
        v-for="(p, j) in l.parts"
        :key="j"
      >
        <strong
          v-if="p.bold"
          v-text="p.text"
        /><span
          v-else
          v-text="p.text"
        />
      </template>
      <br v-if="!l.parts.length">
    </p>
  </div>
</template>
