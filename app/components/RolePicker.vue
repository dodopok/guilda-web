<script setup lang="ts">
// Papel na igreja: todo mundo é voluntário(a); coordenação e pastoral somam, e uma pessoa
// pode ter as duas (igreja pequena). Mais de uma pessoa pode coordenar.
const model = defineModel<string[]>({ required: true })
defineProps<{ small?: boolean }>()
const OPTIONS = [
  { role: 'coordinator', label: 'Coordenação' },
  { role: 'pastor', label: 'Pastor(a)' },
] as const
function toggle(role: string) {
  const set = new Set(model.value.filter((r) => r !== 'participant'))
  if (set.has(role)) set.delete(role)
  else set.add(role)
  model.value = ['participant', ...set]
}
</script>

<template>
  <div
    class="chips"
    role="group"
    aria-label="Papel na igreja"
  >
    <span
      class="chip"
      :class="{ 'chip--sm': small }"
      aria-pressed="true"
      title="Todo mundo serve como voluntário(a)"
    >Voluntário(a)</span>
    <button
      v-for="o in OPTIONS"
      :key="o.role"
      type="button"
      class="chip"
      :class="{ 'chip--sm': small }"
      :aria-pressed="model.includes(o.role)"
      @click="toggle(o.role)"
    >
      <Icon
        v-if="model.includes(o.role)"
        name="check"
        :weight="2.4"
      />{{ o.label }}
    </button>
  </div>
</template>
