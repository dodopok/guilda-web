import { importInputSchema, previewImport } from '~~/server/services/import'

// Prévia da importação de um mês da planilha. Não grava nada.
export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return previewImport(db(), ctx, await body(event, importInputSchema))
})
