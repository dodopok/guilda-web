<script setup lang="ts">
// Interruptor liga/desliga acessível (role="switch").
defineProps<{ modelValue: boolean, title: string, sub?: string, boxed?: boolean, large?: boolean, disabled?: boolean }>()
defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()
</script>

<template>
  <button
    type="button"
    role="switch"
    class="switch"
    :class="{ 'switch--boxed': boxed }"
    :aria-checked="modelValue ? 'true' : 'false'"
    :disabled="disabled"
    @click="$emit('update:modelValue', !modelValue)"
  >
    <span class="grow">
      <slot name="title"><span
        class="strong"
        style="display:block"
      >{{ title }}</span></slot>
      <slot name="sub"><span
        v-if="sub"
        class="small soft"
        style="display:block"
      >{{ sub }}</span></slot>
    </span>
    <span
      class="knob"
      :class="{ 'knob--lg': large }"
    />
  </button>
</template>
