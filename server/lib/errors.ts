// Erro de domínio com código estável para o contrato da API (/api/v1).
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

const FEMININE = new Set(['Igreja', 'Pessoa', 'Função', 'Tarefa', 'Designação', 'Música', 'Mensagem simulada', 'Conta'])
export const notFound = (what = 'Registro') => new AppError(404, 'not_found', `${what} não encontrad${FEMININE.has(what) ? 'a' : 'o'}.`)
export const forbidden = (message = 'Você não tem permissão para esta ação.') => new AppError(403, 'forbidden', message)
export const conflict = (code: string, message: string, details?: unknown) => new AppError(409, code, message, details)
export const badRequest = (code: string, message: string, details?: unknown) => new AppError(400, code, message, details)
export const unauthorized = (message = 'Entre novamente para continuar.') => new AppError(401, 'unauthorized', message)
