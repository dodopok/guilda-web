<script setup lang="ts">
useHead({ title: 'Disponibilidade' })
const route = useRoute()
const month = computed(() => String(route.params.month))
const { link } = useChurch()
</script>

<template>
  <section class="stack-lg availability-page">
    <BackLink
      :to="link('')"
      label="Início"
    />
    <AvailabilityPicker
      :month="month"
      @submitted="navigateTo(link(''))"
    />
  </section>
</template>
