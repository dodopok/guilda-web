import { listReminderRuns, reminderPreview } from '~~/server/services/reminders'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return { preview: await reminderPreview(db(), ctx), runs: await listReminderRuns(db(), ctx) }
})
