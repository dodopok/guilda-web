import { z } from 'zod'
import { setQualifications } from '~~/server/services/people'

const schema = z.object({ dutyIds: z.array(z.string().uuid()).max(200) })

export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, schema)
  await setQualifications(db(), ctx, param(event, 'id'), input.dutyIds)
  return { ok: true }
})
