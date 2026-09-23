import { getLogo } from '~~/server/services/brand'
import { notFound } from '~~/server/lib/errors'

// Logo da igreja para membros. Servido com o tipo conferido no envio e sem interpretação.
export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const logo = await getLogo(db(), ctx.church.id)
  if (!logo) throw notFound('Logo')
  sendLogo(event, logo)
  return logo.bytes
})
