// Confere a integração com a instância real do Estêvão, sem gravar nada no banco.
//   ESTEVAO_API_URL=… ESTEVAO_API_KEY=… npx tsx scripts/estevao-check.ts 2026-10-11 [livro] [complementary|semicontinuous]
// Mostra só o que o roteiro usa (referências, cor, coletas resumidas); nunca imprime a chave.
import { fetchLiturgicalDay } from '../server/integrations/estevao'

const [date = new Date().toISOString().slice(0, 10), book = process.env.ESTEVAO_PRAYER_BOOK ?? 'loc_2027', readingType = process.env.ESTEVAO_READING_TYPE ?? 'complementary'] = process.argv.slice(2)
const url = (process.env.ESTEVAO_API_URL ?? '').replace(/\/$/, '')
const { path, suggestion } = await fetchLiturgicalDay({ url, apiKey: process.env.ESTEVAO_API_KEY ?? '', timeoutMs: 30_000 }, date, { prayerBook: book, readingType })
console.log(`GET ${url}${path}`)
console.log(`${suggestion.date} · ${suggestion.sundayName ?? '—'} · ${suggestion.season ?? '—'} · cor ${suggestion.color ?? '—'}${suggestion.celebration ? ` · ${suggestion.celebration}` : ''}`)
for (const r of suggestion.readings) console.log(`  ${r.label}: ${r.reference}${r.alternatives.length ? ` (ou ${r.alternatives.join(', ')})` : ''}`)
console.log(`  ${suggestion.collects.length} coleta(s): ${suggestion.collects.map((c) => c.title).join(' | ')}`)
