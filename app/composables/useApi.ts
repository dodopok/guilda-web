import type { FetchError } from 'ofetch'

// Cliente da API v1. Usa o cookie de sessão (mesma origem); o navegador envia Origin
// nas escritas, o que satisfaz a proteção CSRF do servidor.
export const api = $fetch.create({
  baseURL: '/api/v1',
  credentials: 'same-origin',
  retry: 0,
})

export interface ApiErrorBody { error?: { code?: string, message?: string, details?: unknown } }

export function apiErrorCode(e: unknown): string | undefined {
  return (e as FetchError<ApiErrorBody>)?.data?.error?.code
}

export function apiErrorMessage(e: unknown, fallback = 'Não foi possível concluir. Tente de novo.'): string {
  const fe = e as FetchError<ApiErrorBody>
  const body = fe?.data?.error
  if (body?.code === 'validation_error' && Array.isArray(body.details) && body.details.length) {
    const first = body.details[0] as { message?: string }
    return first.message ? `${body.message} ${first.message}` : body.message ?? fallback
  }
  if (body?.message) return body.message
  if (fe?.statusCode === 0 || fe?.message?.includes('fetch')) return 'Sem conexão com o servidor. Verifique a internet e tente de novo.'
  // Erros criados pelo próprio app (sem resposta do servidor) já trazem texto para a pessoa.
  if (e instanceof Error && fe.statusCode === undefined && fe.data === undefined && e.message) return e.message
  return fallback
}
