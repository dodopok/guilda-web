import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { churches } from '../db/schema'
import { runDueAvailabilityRequests } from './availability'
import { dispatchQueuedMessages, type DispatchOptions } from './messaging/dispatch'
import { runDueReminders, syncReminderCorrections } from './reminders'

// Um ciclo do trabalhador. Todas as etapas são idempotentes (restrições únicas no banco
// e FOR UPDATE SKIP LOCKED na fila), então dois trabalhadores simultâneos não duplicam
// execuções, correções nem mensagens.
export async function workerTick(db: Db, now = new Date(), dispatch: DispatchOptions = {}) {
  const summary = { availability: 0, reminderRuns: 0, corrections: 0, dispatched: 0 }
  summary.availability = (await runDueAvailabilityRequests(db, now)).length
  summary.reminderRuns = (await runDueReminders(db, now)).filter((r) => r.created).length
  const list = await db.select().from(churches).where(eq(churches.status, 'active'))
  for (const church of list) {
    summary.corrections += (await syncReminderCorrections(db, church, now)).corrections
  }
  summary.dispatched = (await dispatchQueuedMessages(db, { ...dispatch, now })).processed
  return summary
}
