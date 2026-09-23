import { AppError } from '~~/server/lib/errors'

// Qualquer rota de API inexistente responde 404 em JSON (nunca o HTML do app).
export default defineApiHandler(() => {
  throw new AppError(404, 'not_found', 'Rota não encontrada.')
})
