<script setup lang="ts">
const props = defineProps<{ status: string }>()
const s = computed(() => MESSAGE_STATUS[props.status] ?? { label: props.status, tone: 'plain' as const })
</script>

<template>
  <span
    class="tag"
    :class="`tag--${s.tone}`"
  >{{ s.label }}</span>
</template>
