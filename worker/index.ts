// Trabalhador de tarefas agendadas da Guilda: pedidos mensais de indisponibilidade,
// lembretes semanais, correções após mudanças e envio da fila de mensagens.
//   pnpm worker          -> roda em ciclo (WORKER_INTERVAL_SECONDS)
//   pnpm worker --once   -> um ciclo e sai (útil para testes manuais e cron externo)
import '../scripts/load-env'
import { getConfig } from '../server/config'
import { closeDb, getDb } from '../server/db/client'
import { workerTick } from '../server/services/worker-tick'

const once = process.argv.includes('--once')
const interval = getConfig().worker.intervalSeconds * 1000
let stopping = false

async function tick() {
  const started = Date.now()
  try {
    const summary = await workerTick(getDb())
    const busy = summary.availability || summary.reminderRuns || summary.corrections || summary.dispatched
    if (busy || once) console.log(`[worker] ${new Date().toISOString()}`, JSON.stringify(summary), `${Date.now() - started}ms`)
  } catch (err) {
    console.error('[worker] falha no ciclo', err)
  }
}

async function main() {
  console.log(`[worker] iniciado (${once ? 'um ciclo' : `a cada ${interval / 1000}s`})`)
  await tick()
  while (!once && !stopping) {
    await new Promise((r) => setTimeout(r, interval))
    if (!stopping) await tick()
  }
  await closeDb()
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopping = true
    console.log('[worker] encerrando...')
  })
}

await main()
