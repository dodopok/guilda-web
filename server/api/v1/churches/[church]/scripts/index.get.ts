import { z } from 'zod'
import { listScripts } from '~~/server/services/liturgy'
import { monthField } from '~~/server/services/worship'

const schema = z.object({ month: monthField })

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  return { scripts: await listScripts(db(), ctx, query(event, schema).month) }
})
