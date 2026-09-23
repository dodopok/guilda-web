import { z } from 'zod'
import { exportHtml, exportText, getPublishedContent } from '~~/server/services/liturgy'

const schema = z.object({ format: z.enum(['txt', 'html', 'json']).default('html'), version: z.coerce.number().int().positive().optional() })

// Exporta uma versão publicada (texto, HTML imprimível ou JSON) para compartilhamento manual.
export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const q = query(event, schema)
  const pub = await getPublishedContent(db(), ctx, param(event, 'serviceId'), q.version)
  const service = pub.content.service as { localDate: string }
  const filename = `roteiro-${ctx.church.slug}-${service.localDate}-v${pub.version}`
  if (q.format === 'json') return pub
  if (q.format === 'txt') {
    setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
    setHeader(event, 'Content-Disposition', `attachment; filename="${filename}.txt"`)
    return exportText(pub.content, ctx.church.timezone, pub.version)
  }
  setHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  setHeader(event, 'Content-Disposition', `inline; filename="${filename}.html"`)
  setHeader(event, 'Content-Security-Policy', 'default-src \'none\'; style-src \'unsafe-inline\'')
  return exportHtml(pub.content, ctx.church.timezone, pub.version)
})
