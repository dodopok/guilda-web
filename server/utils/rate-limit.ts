import type { H3Event } from 'h3'
import { AppError } from '../lib/errors'

// Limite simples em memória por IP e rota sensível (login, convite, senha).
// Em várias instâncias, complementar com limite no proxy reverso.
const buckets = new Map<string, { count: number, resetAt: number }>()

export function rateLimit(event: H3Event, key: string, max: number, windowMs: number) {
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  const id = `${key}:${ip}`
  const now = Date.now()
  const bucket = buckets.get(id)
  if (!bucket || bucket.resetAt < now) {
    buckets.set(id, { count: 1, resetAt: now + windowMs })
  } else {
    bucket.count++
    if (bucket.count > max) {
      throw new AppError(429, 'rate_limited', 'Muitas tentativas. Aguarde um pouco e tente de novo.')
    }
  }
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k)
  }
}
