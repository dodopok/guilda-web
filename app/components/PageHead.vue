<script setup lang="ts">
// Cabeçalho das telas internas: voltar, título, frase de apoio e ação à direita.
defineProps<{ title: string, lede?: string, back?: string, backLabel?: string, eyebrow?: string }>()
</script>

<template>
  <div class="phead">
    <div class="phead__text">
      <BackLink
        v-if="back"
        :to="back"
        :label="backLabel ?? 'Voltar'"
      />
      <p
        v-if="eyebrow"
        class="caps"
      >
        {{ eyebrow }}
      </p>
      <h1 class="h1 h1--sm">
        {{ title }}
      </h1>
      <p
        v-if="lede || $slots.lede"
        class="lede"
      >
        <slot name="lede">
          {{ lede }}
        </slot>
      </p>
    </div>
    <slot />
  </div>
</template>
