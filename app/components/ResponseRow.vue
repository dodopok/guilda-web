<script setup lang="ts">
import type { Response } from '#shared/liturgy'

// Uma resposta de leitura no modelo: liga/desliga, resumo e "mudar texto".
const props = defineProps<{ modelValue: Response, label: string, hint?: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Response): void }>()
const editing = ref(false)
const set = (patch: Partial<Response>) => emit('update:modelValue', { ...props.modelValue, ...patch })
const uid = useId()
</script>

<template>
  <div class="resprow">
    <label class="resprow__head">
      <input
        type="checkbox"
        :checked="modelValue.on"
        @change="set({ on: ($event.target as HTMLInputElement).checked })"
      >
      <span class="strong">{{ label }}</span>
    </label>
    <div
      v-if="modelValue.on"
      class="resprow__body"
    >
      <template v-if="!editing">
        <p>{{ modelValue.leader || '—' }}</p>
        <p v-if="modelValue.people">
          <strong>Todos: {{ modelValue.people }}</strong>
        </p>
        <button
          type="button"
          class="linkbtn"
          :aria-label="`Mudar texto: ${label}`"
          @click="editing = true"
        >
          Mudar texto
        </button>
      </template>
      <template v-else>
        <label
          class="field"
          :for="`${uid}-l`"
        >
          <span class="field__label">Quem lê diz</span>
          <input
            :id="`${uid}-l`"
            class="input"
            maxlength="300"
            :value="modelValue.leader"
            @input="set({ leader: ($event.target as HTMLInputElement).value })"
          >
        </label>
        <label
          class="field"
          :for="`${uid}-p`"
        >
          <span class="field__label">Todos respondem <span class="muted">(pode ficar vazio)</span></span>
          <input
            :id="`${uid}-p`"
            class="input"
            maxlength="300"
            :value="modelValue.people"
            @input="set({ people: ($event.target as HTMLInputElement).value })"
          >
        </label>
        <p
          v-if="hint"
          class="field__hint"
        >
          {{ hint }}
        </p>
        <button
          type="button"
          class="btn btn--secondary btn--xs"
          style="align-self:flex-start"
          @click="editing = false"
        >
          Pronto
        </button>
      </template>
    </div>
  </div>
</template>
