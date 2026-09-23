import { myTasks } from '~~/server/services/schedule'

// ?past=1 devolve também as tarefas dos últimos 90 dias ("Já passaram").
export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const past = getQuery(event).past === '1'
  return { tasks: await myTasks(db(), ctx, past ? { from: new Date(Date.now() - 90 * 86400_000) } : {}) }
})
