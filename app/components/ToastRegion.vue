<script setup lang="ts">
const { toasts } = useToast()
</script>

<template>
  <div
    class="toasts"
    role="status"
    aria-live="polite"
  >
    <div
      v-for="t in toasts"
      :key="t.id"
      class="toast"
      :class="{ 'toast--error': t.kind === 'error' }"
    >
      <Icon :name="t.kind === 'error' ? 'alert' : 'check'" />
      <span>{{ t.text }}</span>
    </div>
  </div>
</template>
