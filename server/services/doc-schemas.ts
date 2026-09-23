import { z } from 'zod'

// Formas documentadas de entradas cujo esquema de validação usa coerção (datas).
export const availabilityRequestSchemaDoc = z.object({
  sendAt: z.string().describe('Instante ISO 8601 do envio (pode ser no mês anterior)'),
  deadlineAt: z.string().describe('Instante ISO 8601 do prazo de resposta'),
})
