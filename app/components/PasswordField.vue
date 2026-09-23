<script setup lang="ts">
const model = defineModel<string>({ required: true })
const props = defineProps<{ label: string, autocomplete: string, hint?: string, id?: string, minlength?: number }>()
const shown = ref(false)
const uid = useId()
const fieldId = computed(() => props.id ?? uid)
</script>

<template>
  <div class="field">
    <label
      class="field__label"
      :for="fieldId"
    >{{ label }}</label>
    <div style="position:relative">
      <input
        :id="fieldId"
        v-model="model"
        class="input"
        :type="shown ? 'text' : 'password'"
        :autocomplete="autocomplete"
        :minlength="minlength"
        required
        style="padding-right:5.5rem"
        :aria-describedby="hint ? `${fieldId}-hint` : undefined"
      >
      <button
        type="button"
        class="btn btn--quiet btn--small"
        style="position:absolute;right:.3rem;top:.3rem"
        :aria-pressed="shown"
        @click="shown = !shown"
      >
        {{ shown ? 'Ocultar' : 'Mostrar' }}
      </button>
    </div>
    <span
      v-if="hint"
      :id="`${fieldId}-hint`"
      class="field__hint"
    >{{ hint }}</span>
  </div>
</template>
