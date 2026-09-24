<script setup lang="ts">
// Folha: sobe de baixo no celular e vira diálogo centralizado no computador. Usa <dialog>
// nativo (foco preso, Esc fecha, título anunciado).
const props = defineProps<{ open: boolean, title?: string, lede?: string, label?: string, placement?: 'center' | 'right', panel?: boolean, size?: 'default' | 'compact' }>()
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
</script>

<template>
  <dialog
    ref="el"
    class="sheet"
    :class="{ 'sheet--right': placement === 'right', 'sheet--panel': panel, 'sheet--compact': size === 'compact' }"
    :aria-labelledby="title ? titleId : undefined"
    :aria-label="!title ? label : undefined"
    @close="onClose"
  >
    <div
      class="sheet__wrap"
      @click.self="el?.close()"
    >
      <div class="sheet__box">
        <div class="sheet__close">
          <button
            type="button"
            class="icon-btn icon-btn--round"
            aria-label="Fechar"
            @click="el?.close()"
          >
            <Icon
              name="x"
              :weight="2.2"
            />
          </button>
        </div>
        <slot name="head">
          <h2
            v-if="title"
            :id="titleId"
            class="sheet__title"
          >
            {{ title }}
          </h2>
          <p
            v-if="lede"
            class="sheet__lede"
          >
            {{ lede }}
          </p>
        </slot>
        <slot />
      </div>
    </div>
  </dialog>
</template>
