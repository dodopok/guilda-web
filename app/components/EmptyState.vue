<script setup lang="ts">
defineProps<{ title: string, text?: string }>()
</script>

<template>
  <div class="empty">
    <h3>{{ title }}</h3>
    <p v-if="text">
      {{ text }}
    </p>
    <div
      v-if="$slots.default"
      class="row"
    >
      <slot />
    </div>
  </div>
</template>
