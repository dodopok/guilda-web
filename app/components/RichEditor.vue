<script setup lang="ts">
import { Editor, EditorContent } from '@tiptap/vue-3'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Bold from '@tiptap/extension-bold'
import { Placeholder, UndoRedo } from '@tiptap/extensions'
import type { JSONContent } from '@tiptap/core'
import { parseRichText, type RichLine, serializeRichText } from '#shared/liturgy'

// Editor de texto dos ritos com só três estilos: normal, negrito (o que todos dizem) e
// rubrica (instrução: itálico, vermelho, à direita). Guarda texto simples com marcas
// (**negrito**, "> " rubrica), nunca HTML.
const props = defineProps<{ modelValue: string, label: string, placeholder?: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const RubricParagraph = Paragraph.extend({
  addAttributes() {
    return {
      rubric: {
        default: false,
        parseHTML: (el) => el.classList.contains('rubric'),
        renderHTML: (attrs) => (attrs.rubric ? { class: 'rubric' } : {}),
      },
    }
  },
})

function toDoc(src: string): JSONContent {
  const lines = parseRichText(src)
  return {
    type: 'doc',
    content: (lines.length ? lines : [{ rubric: false, parts: [] }]).map((l) => ({
      type: 'paragraph',
      attrs: { rubric: l.rubric },
      content: l.parts.filter((p) => p.text).map((p) => ({ type: 'text', text: p.text, ...(p.bold ? { marks: [{ type: 'bold' }] } : {}) })),
    })),
  }
}
function fromDoc(doc: JSONContent): string {
  const lines: RichLine[] = (doc.content ?? []).map((n) => ({
    rubric: Boolean(n.attrs?.rubric),
    parts: (n.content ?? []).map((t) => ({ text: t.text ?? '', bold: Boolean(t.marks?.some((m) => m.type === 'bold')) })),
  }))
  return serializeRichText(lines)
}

const editor = new Editor({
  content: toDoc(props.modelValue),
  extensions: [Document, RubricParagraph, Text, Bold, UndoRedo, Placeholder.configure({ placeholder: props.placeholder ?? '' })],
  editorProps: {
    attributes: { 'class': 'richedit__area', 'role': 'textbox', 'aria-multiline': 'true', 'aria-label': props.label },
  },
  onUpdate: ({ editor: e }) => emit('update:modelValue', fromDoc(e.getJSON())),
})
watch(() => props.modelValue, (v) => {
  if (v !== fromDoc(editor.getJSON())) editor.commands.setContent(toDoc(v), { emitUpdate: false })
})
onBeforeUnmount(() => editor.destroy())

// Estado dos botões acompanha o cursor.
const tick = ref(0)
editor.on('transaction', () => tick.value++)
const isBold = computed(() => (tick.value, editor.isActive('bold')))
const isRubric = computed(() => (tick.value, Boolean(editor.getAttributes('paragraph').rubric)))

function normal() {
  editor.chain().focus().unsetBold().updateAttributes('paragraph', { rubric: false }).run()
}
function bold() {
  editor.chain().focus().toggleBold().run()
}
function rubric() {
  editor.chain().focus().updateAttributes('paragraph', { rubric: !isRubric.value }).run()
}
</script>

<template>
  <div class="richedit">
    <div
      class="richedit__bar"
      role="toolbar"
      :aria-label="`Estilo do texto: ${label}`"
    >
      <button
        type="button"
        class="richedit__btn"
        :aria-pressed="!isBold && !isRubric"
        @mousedown.prevent
        @click="normal"
      >
        Normal
      </button>
      <button
        type="button"
        class="richedit__btn"
        :aria-pressed="isBold"
        title="O que todos dizem juntos"
        @mousedown.prevent
        @click="bold"
      >
        <strong>Negrito</strong>
      </button>
      <button
        type="button"
        class="richedit__btn richedit__btn--rubric"
        :aria-pressed="isRubric"
        title="Instrução: itálico, vermelho, à direita"
        @mousedown.prevent
        @click="rubric"
      >
        <em>Rubrica</em>
      </button>
    </div>
    <EditorContent :editor="editor" />
  </div>
</template>
