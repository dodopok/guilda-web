// Servidor local que imita o contrato do Estêvão (GET /api/v1/calendar/:y/:m/:d) com
// dados FICTÍCIOS, para demonstrar a integração sem chave real.
//   pnpm estevao:mock   e no .env: ESTEVAO_API_URL=http://localhost:4010  ESTEVAO_API_KEY=local-mock
// Exige o cabeçalho X-API-Key, como a instância real. Com ?falhar=1 responde 503.
import { createServer } from 'node:http'

const PORT = Number(process.env.ESTEVAO_MOCK_PORT ?? 4010)
const COLORS = ['verde', 'roxo', 'branco', 'verde', 'vermelho']

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  const m = url.pathname.match(/^\/api\/v1\/calendar\/(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
  res.setHeader('Content-Type', 'application/json')
  if (!req.headers['x-api-key']) {
    res.statusCode = 401
    return res.end(JSON.stringify({ error: 'API key obrigatória' }))
  }
  if (!m || url.searchParams.get('falhar')) {
    res.statusCode = m ? 503 : 404
    return res.end(JSON.stringify({ error: 'indisponível' }))
  }
  const [, y, mo, d] = m
  const date = `${y}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}`
  const n = Number(d)
  res.end(JSON.stringify({
    date,
    liturgical_season: 'Tempo Comum (exemplo)',
    liturgical_color: COLORS[n % COLORS.length],
    sunday_name: `Domingo de exemplo ${n}`,
    celebration: n % 7 === 0 ? { name: 'Celebração fictícia', type: 'festival' } : null,
    celebrations: [],
    collect: [
      { text: 'Texto fictício de coleta, apenas para demonstração local. Amém.', title: `Domingo de exemplo ${n}`, module_title: 'Coleta do Dia' },
    ],
    readings: {
      first_reading: { reference: `Gn ${n}.1-10` },
      psalm: { reference: `Sl ${n + 10}` },
      second_reading: { reference: `Rm ${(n % 16) + 1}.1-8` },
      gospel: { reference: `Mt ${(n % 28) + 1}.1-12`, alternative: { reference: `Mt ${(n % 28) + 1}.1-6` } },
    },
  }))
}).listen(PORT, () => console.log(`[estevao-mock] http://localhost:${PORT} (dados fictícios)`))
