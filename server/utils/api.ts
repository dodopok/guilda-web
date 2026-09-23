import type { EventHandler, EventHandlerRequest, H3Event } from 'h3'
import { z } from 'zod'
import { getConfig } from '../config'
import { getDb } from '../db/client'
import { AppError, unauthorized } from '../lib/errors'
import { type Actor, type ChurchContext, resolveChurchContext } from '../services/context'

export interface AuthState {
  accountId: string
  isPlatformAdmin: boolean
  displayName: string
  login: string
  tokenHash: string
  via: 'cookie' | 'bearer'
}

declare module 'h3' {
  interface H3EventContext {
    auth?: AuthState
    churchCtx?: ChurchContext
  }
}

export const SESSION_COOKIE = 'guilda_session'

// Envolve os handlers da API v1: converte erros de domínio e de validação no formato
// estável { error: { code, message, details? } } documentado em docs/api.md.
export function defineApiHandler<T>(handler: (event: H3Event) => Promise<T> | T): EventHandler<EventHandlerRequest, Promise<T | { error: unknown }>> {
  return defineEventHandler(async (event) => {
    try {
      return await handler(event)
    } catch (err) {
      if (err instanceof AppError) {
        setResponseStatus(event, err.status)
        return { error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) } }
      }
      if (err instanceof z.ZodError) {
        setResponseStatus(event, 422)
        return {
          error: {
            code: 'validation_error',
            message: 'Alguns campos não são válidos.',
            details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          },
        }
      }
      // Erros de unicidade do PostgreSQL viram conflito, sem expor detalhes do banco.
      const pgCode = (err as { code?: string, cause?: { code?: string } }).cause?.code ?? (err as { code?: string }).code
      if (pgCode === '23505') {
        setResponseStatus(event, 409)
        return { error: { code: 'conflict', message: 'Já existe um registro com esses dados.' } }
      }
      if (pgCode === '23503') {
        setResponseStatus(event, 409)
        return { error: { code: 'reference_conflict', message: 'O registro está em uso ou referencia algo inexistente.' } }
      }
      if (pgCode === '22P02') {
        setResponseStatus(event, 404)
        return { error: { code: 'not_found', message: 'Registro não encontrado.' } }
      }
      console.error('[api] erro inesperado', event.method, event.path, err)
      setResponseStatus(event, 500)
      return { error: { code: 'internal_error', message: 'Erro inesperado. Tente novamente.' } }
    }
  })
}

export function db() {
  return getDb()
}

export function requireAuth(event: H3Event): AuthState {
  const auth = event.context.auth
  if (!auth) throw unauthorized()
  return auth
}

export function actorOf(event: H3Event): Actor {
  const auth = requireAuth(event)
  return { accountId: auth.accountId, isPlatformAdmin: auth.isPlatformAdmin }
}

// Contexto da igreja da rota /api/v1/churches/:church/...
export async function churchContext(event: H3Event): Promise<ChurchContext> {
  if (event.context.churchCtx) return event.context.churchCtx
  const slug = getRouterParam(event, 'church')
  if (!slug) throw new AppError(404, 'not_found', 'Igreja não encontrada.')
  const ctx = await resolveChurchContext(getDb(), actorOf(event), slug)
  event.context.churchCtx = ctx
  return ctx
}

export async function body<T extends z.ZodType>(event: H3Event, schema: T): Promise<z.infer<T>> {
  const raw = await readBody(event).catch(() => undefined)
  return schema.parse(raw ?? {})
}

export function query<T extends z.ZodType>(event: H3Event, schema: T): z.infer<T> {
  return schema.parse(getQuery(event))
}

export function param(event: H3Event, name: string): string {
  const value = getRouterParam(event, name)
  if (!value) throw new AppError(404, 'not_found', 'Registro não encontrado.')
  return z.string().uuid().catch('00000000-0000-0000-0000-000000000000').parse(value)
}

export function setSessionCookie(event: H3Event, token: string, expiresAt: Date) {
  setCookie(event, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: getConfig().sessionCookieSecure,
    path: '/',
    expires: expiresAt,
  })
}

// Web recebe cookie httpOnly; o app nativo (client=native) recebe o token no corpo.
export function sessionResponse(event: H3Event, client: 'web' | 'native', token: string, expiresAt: Date) {
  if (client === 'web') {
    setSessionCookie(event, token, expiresAt)
    return { expiresAt }
  }
  return { token, expiresAt }
}
