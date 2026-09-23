<script setup lang="ts">
// Folha modal com <dialog> nativo: foco preso, Esc fecha, leitor de tela anuncia o título.
const props = defineProps<{ open: boolean, title: string, wide?: boolean }>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void, (e: 'close'): void }>()
const el = ref<HTMLDialogElement>()
const titleId = useId()

watch(() => props.open, (v) => {
  if (!el.value) return
  if (v && !el.value.open) el.value.showModal()
  if (!v && el.value.open) el.value.close()
}, { flush: 'post' })
onMounted(() => {
  if (props.open) el.value?.showModal()
})
function onClose() {
  emit('update:open', false)
  emit('close')
}
function onBackdrop(e: MouseEvent) {
  if (e.target === el.value) el.value?.close()
}
</script>

<template>
  <dialog
    ref="el"
    class="sheet"
    :style="wide ? 'width:min(56rem,100vw)' : undefined"
    :aria-labelledby="titleId"
    @close="onClose"
    @click="onBackdrop"
  >
    <div class="sheet__head">
      <h2 :id="titleId">
        {{ title }}
      </h2>
      <button
        type="button"
        class="btn btn--icon btn--quiet"
        aria-label="Fechar"
        @click="el?.close()"
      >
        <Icon name="x" />
      </button>
    </div>
    <div class="sheet__body">
      <slot />
    </div>
    <div
      v-if="$slots.foot"
      class="sheet__foot"
    >
      <slot name="foot" />
    </div>
  </dialog>
</template>
