<script setup lang="ts">
const props = defineProps<{ status: string, short?: boolean }>()
const s = computed(() => ASSIGNMENT_STATUS[props.status] ?? { label: props.status, icon: 'circle', cls: 'status--neutral' })
</script>

<template>
  <span
    class="status"
    :class="s.cls"
  >
    <Icon :name="s.icon" />
    <span :class="{ 'sr-only': short }">{{ s.label }}</span>
  </span>
</template>
