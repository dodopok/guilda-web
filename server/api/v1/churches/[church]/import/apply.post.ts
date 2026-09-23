import { applyImport, importInputSchema } from '~~/server/services/import'

// Aplica a importação revisada. Repetir a mesma planilha não duplica nada.
export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return applyImport(db(), ctx, await body(event, importInputSchema))
})
