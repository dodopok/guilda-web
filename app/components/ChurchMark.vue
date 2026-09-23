<script setup lang="ts">
// Logo da igreja ou, sem logo, as iniciais sobre a cor da igreja.
const props = withDefaults(defineProps<{ name: string, src?: string | null, size?: number, radius?: number, onAccent?: boolean }>(), { src: null, size: 42, radius: 13, onAccent: false })
const failed = ref(false)
watch(() => props.src, () => {
  failed.value = false
})
const style = computed(() => ({ width: `${props.size}px`, height: `${props.size}px`, borderRadius: `${props.radius}px`, fontSize: `${Math.round(props.size * 0.36)}px` }))
</script>

<template>
  <span
    class="cmark"
    :class="{ 'cmark--on-accent': onAccent && !(src && !failed), 'cmark--has-logo': src && !failed }"
    :style="style"
  >
    <img
      v-if="src && !failed"
      :src="src"
      :alt="`Logo de ${name}`"
      @error="failed = true"
    >
    <span
      v-else
      aria-hidden="true"
    >{{ initials(name || 'Igreja') }}</span>
  </span>
</template>
