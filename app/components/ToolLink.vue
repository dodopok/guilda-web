<script setup lang="ts">
// Linha de atalho com ícone suave, frase de apoio e selo opcional.
defineProps<{ to: string, icon: string, label: string, sub?: string, badge?: string | number | null, badgeTone?: 'red' | 'amber' }>()
</script>

<template>
  <NuxtLink
    :to="to"
    class="listrow"
  >
    <span class="ticon"><Icon
      :name="icon"
      :weight="2"
    /></span>
    <span style="flex:1;min-width:0">
      <span
        class="strong"
        style="display:block"
      >{{ label }}</span>
      <span
        v-if="sub"
        class="soft"
        style="display:block;font-size:13.5px"
      >{{ sub }}</span>
    </span>
    <span
      v-if="badge"
      :class="badgeTone === 'red' ? 'badge-count' : 'badge-amber'"
      :style="badgeTone === 'red' ? 'min-width:24px;height:24px;font-size:12.5px;padding:0 8px' : ''"
    >{{ badge }}</span>
    <Icon
      name="chevron-right"
      class="listrow__chev"
    />
  </NuxtLink>
</template>
