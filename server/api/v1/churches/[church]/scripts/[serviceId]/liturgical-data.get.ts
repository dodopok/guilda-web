import { fetchSuggestions } from '~~/server/services/liturgy'

// Consulta o Estêvão e guarda uma foto (origem e horário). Em falha, devolve o erro e a
// última foto guardada; o roteiro continua editável manualmente.
export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return fetchSuggestions(db(), ctx, param(event, 'serviceId'))
})
