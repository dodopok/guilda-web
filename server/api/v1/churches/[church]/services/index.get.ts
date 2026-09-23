import { z } from 'zod'
import { listServices, monthField } from '~~/server/services/worship'

const schema = z.object({ month: monthField })

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const q = query(event, schema)
  return { services: await listServices(db(), ctx, q.month) }
})
