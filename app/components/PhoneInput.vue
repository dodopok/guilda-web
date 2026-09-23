<script setup lang="ts">
// Campo de celular com máscara brasileira: (51) 99999-9999. Com allowText (tela de entrar),
// texto com letras ou @ passa sem máscara, para quem entra por e-mail.
const model = defineModel<string>({ required: true })
const props = defineProps<{ allowText?: boolean }>()
const el = ref<HTMLInputElement>()

function format(v: string) {
  if (props.allowText && /[a-z@]/i.test(v)) return v
  return maskPhoneBR(v)
}
function onInput(e: Event) {
  const input = e.target as HTMLInputElement
  const atEnd = input.selectionStart === input.value.length
  const next = format(input.value)
  model.value = next
  if (input.value !== next) {
    input.value = next
    if (atEnd) input.setSelectionRange(next.length, next.length)
  }
}
// Valor vindo de fora (ex.: +5551999990004 do cadastro) já aparece formatado.
watch(model, (v) => {
  const f = format(v ?? '')
  if (f !== v) model.value = f
}, { immediate: true })
defineExpose({ focus: () => el.value?.focus() })
</script>

<template>
  <input
    ref="el"
    :value="model"
    class="input"
    :type="allowText ? 'text' : 'tel'"
    :inputmode="allowText ? 'text' : 'tel'"
    autocomplete="tel-national"
    placeholder="(51) 99999-9999"
    @input="onInput"
  >
</template>
