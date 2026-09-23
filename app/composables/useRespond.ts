import type { Task } from '~/types'

// Confirmar ou recusar uma tarefa, com a versão que a pessoa estava vendo.
export function useRespond(onDone: () => unknown) {
  const { capi } = useChurch()
  const toast = useToast()
  const busy = ref<string | null>(null)
  async function respond(task: Task, decision: 'confirmed' | 'declined', note?: string) {
    busy.value = task.assignmentId
    try {
      await capi(`/assignments/${task.assignmentId}/respond`, { method: 'POST', body: { decision, note: note || null, rowVersion: task.rowVersion } })
      toast.ok(decision === 'confirmed' ? `Confirmado: ${task.duty.name}. Obrigado!` : 'A coordenação foi avisada de que você não pode.')
      await onDone()
    } catch (e) {
      toast.error(e)
      if (apiErrorCode(e) === 'stale_assignment') await onDone()
    } finally {
      busy.value = null
    }
  }
  return { respond, busy }
}
