import { getConfig } from '~~/server/config'
import { EstevaoError, fetchPrayerBooks } from '~~/server/integrations/estevao'
import { requireCoordinator } from '~~/server/services/context'

// Livros de oração disponíveis no Estêvão, para a coordenação escolher. Sem o Estêvão,
// devolve só o livro atual e o motivo — o roteiro continua funcionando à mão.
export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  requireCoordinator(ctx)
  const cfg = getConfig().estevao
  try {
    return { available: true, books: await fetchPrayerBooks({ url: cfg.url, apiKey: cfg.apiKey, timeoutMs: cfg.timeoutMs }), current: ctx.church.liturgicalPrayerBook }
  } catch (err) {
    if (!(err instanceof EstevaoError)) throw err
    return { available: false, reason: err.message, books: [{ code: ctx.church.liturgicalPrayerBook, name: ctx.church.liturgicalPrayerBook }], current: ctx.church.liturgicalPrayerBook }
  }
})
