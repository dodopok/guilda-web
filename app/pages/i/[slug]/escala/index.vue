<script setup lang="ts">
const { tz, link } = useChurch()
await navigateTo(link(`/escala/${currentMonth(tz.value)}`), { replace: true })
</script>

<template>
  <div />
</template>
