import { z } from 'zod'
import { exportHtml, exportText, getDraftContent, getPublishedContent } from '~~/server/services/liturgy'

const schema = z.object({ format: z.enum(['txt', 'html', 'json']).default('html'), version: z.coerce.number().int().positive().optional(), draft: z.enum(['true']).optional() })

// Exporta a versão publicada ou, para coordenação e pastores, o rascunho atual.
export default defineApiHandler(async (event) => {
  const ctx = await churchContext(event)
  const q = query(event, schema)
  const pub = q.draft
    ? await getDraftContent(db(), ctx, param(event, 'serviceId'))
    : await getPublishedContent(db(), ctx, param(event, 'serviceId'), q.version)
  const service = pub.content.service as { localDate: string }
  const filename = `roteiro-${ctx.church.slug}-${service.localDate}-${typeof pub.version === 'number' ? `v${pub.version}` : 'rascunho'}`
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
