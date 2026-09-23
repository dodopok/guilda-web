<script setup lang="ts">
defineProps<{ to: string, label: string }>()
</script>

<template>
  <NuxtLink
    :to="to"
    class="back"
  >
    <Icon
      name="arrow-left"
      :weight="2"
    />{{ label }}
  </NuxtLink>
</template>
