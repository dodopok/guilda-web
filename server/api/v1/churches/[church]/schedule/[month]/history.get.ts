import { scheduleHistory } from '~~/server/services/schedule'
import { monthField } from '~~/server/services/worship'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return { versions: await scheduleHistory(db(), ctx, monthField.parse(getRouterParam(event, 'month'))) }
})
