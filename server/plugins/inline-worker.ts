import { getDb } from '../db/client'
import { workerTick } from '../services/worker-tick'

// Conveniência para desenvolvimento local: com WORKER_INLINE=true o próprio servidor web
// roda o ciclo do trabalhador. Em produção, use o processo separado (pnpm worker).
export default defineNitroPlugin(() => {
  if (process.env.WORKER_INLINE !== 'true') return
  if (process.env.NODE_ENV === 'production') {
    console.warn('[worker] WORKER_INLINE ignorado em produção; rode "pnpm worker" separadamente.')
    return
  }
  const seconds = Number(process.env.WORKER_INTERVAL_SECONDS ?? 30)
  let running = false
  setInterval(async () => {
    if (running) return
    running = true
    try {
      await workerTick(getDb())
    } catch (err) {
      console.error('[worker inline] falha', err)
    } finally {
      running = false
    }
  }, Math.max(5, seconds) * 1000)
  console.log(`[worker] ciclo embutido a cada ${seconds}s (somente desenvolvimento)`)
})
