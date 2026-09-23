import { myTasks } from '~~/server/services/schedule'

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return { tasks: await myTasks(db(), ctx) }
})
