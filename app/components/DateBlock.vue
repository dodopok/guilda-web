<script setup lang="ts">
const props = defineProps<{ at: string, tz: string }>()
const today = computed(() => localDateKey(props.at, props.tz) === localDateKey(new Date(), props.tz))
</script>

<template>
  <div
    class="dateblock"
    :class="{ 'dateblock--today': today }"
    aria-hidden="true"
  >
    <div class="dateblock__wd">
      {{ today ? 'hoje' : weekdayShort(at, tz) }}
    </div>
    <span class="dateblock__d">{{ dayNumber(at, tz) }}</span>
    <div class="dateblock__m">
      {{ monthShort(at, tz) }}
    </div>
  </div>
</template>
