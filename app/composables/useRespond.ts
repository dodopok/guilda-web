import type { Task } from '~/types'

// Confirmar ou recusar uma tarefa, com a versão que a pessoa estava vendo.
export function useRespond(onDone: () => unknown) {
  const { capi } = useChurch()
  const toast = useToast()
  const busy = ref<string | null>(null)
  async function respond(task: Task, decision: 'confirmed' | 'declined', note?: string, successMessage?: string, candidatePersonId?: string) {
    busy.value = task.assignmentId
    try {
      await capi(`/assignments/${task.assignmentId}/respond`, { method: 'POST', body: { decision, note: note || null, rowVersion: task.rowVersion, ...(candidatePersonId ? { candidatePersonId } : {}) } })
      toast.ok(successMessage ?? (decision === 'confirmed' ? `Confirmado: ${task.duty.name}. Obrigado!` : 'A coordenação foi avisada de que você não pode.'))
      try {
        await onDone()
      } catch {
        toast.error('Sua resposta foi salva, mas não foi possível atualizar a tela. Recarregue para ver o estado atual.')
      }
      return true
    } catch (e) {
      toast.error(e)
      if (apiErrorCode(e) === 'stale_assignment') {
        try {
          await onDone()
        } catch {
          toast.error('Não foi possível atualizar a tarefa. Recarregue para ver o estado atual.')
        }
      }
      return false
    } finally {
      busy.value = null
    }
  }
  return { respond, busy }
}
