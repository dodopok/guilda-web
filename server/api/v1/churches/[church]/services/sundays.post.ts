import { z } from 'zod'
import { createSundayServices, monthField } from '~~/server/services/worship'

const schema = z.object({
  month: monthField,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('09:30'),
  title: z.string().trim().min(2).max(120).default('Culto dominical'),
  durationMinutes: z.number().int().min(15).max(600).default(120),
})

// Cria os cultos de todos os domingos do mês (sem duplicar os existentes).
export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const input = await body(event, schema)
  return { created: await createSundayServices(db(), ctx, input) }
})
