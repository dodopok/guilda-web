<script setup lang="ts">
// Troca de mês com rótulo por extenso; o valor é AAAA-MM.
const model = defineModel<string>({ required: true })
</script>

<template>
  <div
    class="row"
    role="group"
    aria-label="Mês"
  >
    <button
      type="button"
      class="btn btn--icon"
      :aria-label="`Mês anterior: ${monthLabel(shiftMonth(model, -1))}`"
      @click="model = shiftMonth(model, -1)"
    >
      <Icon name="arrow-left" />
    </button>
    <strong
      class="serif"
      style="font-size:1.35rem;min-width:11rem;text-align:center"
      aria-live="polite"
    >{{ monthLabel(model) }}</strong>
    <button
      type="button"
      class="btn btn--icon"
      :aria-label="`Próximo mês: ${monthLabel(shiftMonth(model, 1))}`"
      @click="model = shiftMonth(model, 1)"
    >
      <Icon name="arrow-right" />
    </button>
  </div>
</template>
