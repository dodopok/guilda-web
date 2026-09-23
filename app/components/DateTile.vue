<script setup lang="ts">
const props = withDefaults(defineProps<{ date: string | Date, tz: string, accent?: boolean, large?: boolean, month?: boolean }>(), { accent: false, large: false, month: false })
</script>

<template>
  <div
    class="dtile"
    :class="{ 'dtile--accent': props.accent, 'dtile--lg': props.large }"
    aria-hidden="true"
  >
    <div class="dtile__wd">
      {{ weekdayShort(props.date, props.tz) }}
    </div>
    <div class="dtile__day">
      {{ dayNumber(props.date, props.tz) }}
    </div>
    <div
      v-if="props.month"
      class="dtile__mo"
    >
      {{ monthShort(props.date, props.tz) }}
    </div>
  </div>
</template>
