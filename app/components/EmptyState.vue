<script setup lang="ts">
defineProps<{ title: string, text?: string }>()
</script>

<template>
  <div class="card--dashed">
    <p
      class="strong"
      style="font-size:18px"
    >
      {{ title }}
    </p>
    <p
      v-if="text"
      class="soft"
      style="margin:6px auto 0;max-width:400px"
    >
      {{ text }}
    </p>
    <div
      v-if="$slots.default"
      style="margin-top:16px"
    >
      <slot />
    </div>
  </div>
</template>
