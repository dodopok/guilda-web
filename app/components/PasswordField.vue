<script setup lang="ts">
const model = defineModel<string>({ required: true })
const props = defineProps<{ label: string, autocomplete: string, hint?: string, id?: string, minlength?: number, placeholder?: string }>()
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
        class="input input--lg"
        :type="shown ? 'text' : 'password'"
        :autocomplete="autocomplete"
        :minlength="minlength"
        :placeholder="placeholder"
        required
        style="padding-right:92px"
        :aria-describedby="hint ? `${fieldId}-hint` : undefined"
      >
      <button
        type="button"
        class="link link--muted"
        style="position:absolute;right:14px;top:50%;transform:translateY(-50%)"
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
