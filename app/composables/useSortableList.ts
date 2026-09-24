import Sortable from 'sortablejs'
import type { Ref } from 'vue'

// Arrastar para reordenar (dedo ou mouse) pela alça `handle`. O SortableJS move o DOM;
// aqui a mudança é desfeita no DOM e aplicada na lista, para o Vue continuar no controle.
export function useSortableList<T>(el: Ref<HTMLElement | null>, list: Ref<T[]>, handle = '.drag-handle') {
  let sortable: Sortable | null = null
  function attach(node: HTMLElement | null) {
    sortable?.destroy()
    sortable = null
    if (!node) return
    sortable = Sortable.create(node, {
      handle,
      animation: 160,
      delay: 0,
      ghostClass: 'is-drag-ghost',
      chosenClass: 'is-drag-chosen',
      onEnd(e) {
        const { oldIndex, newIndex, item, from } = e
        if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return
        from.removeChild(item)
        from.insertBefore(item, from.children[oldIndex] ?? null)
        moveItem(oldIndex, newIndex)
      },
    })
  }
  function moveItem(from: number, to: number) {
    if (to < 0 || to >= list.value.length || from === to) return
    const next = [...list.value]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved!)
    list.value = next
  }
  watch(el, attach, { flush: 'post' })
  onMounted(() => attach(el.value))
  onBeforeUnmount(() => sortable?.destroy())
  return { moveItem }
}
