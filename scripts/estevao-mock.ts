// Servidor local que imita o contrato da API v2 do Estêvão (GET /api/v2/days/:date) com
// dados FICTÍCIOS, para demonstrar a integração sem chave real.
//   pnpm estevao:mock   e no .env: ESTEVAO_API_URL=http://localhost:4010  ESTEVAO_API_KEY=local-mock
// Exige X-API-Key e o parâmetro book, como a instância real. Com ?falhar=1 responde 503.
import { createServer } from 'node:http'

const PORT = Number(process.env.ESTEVAO_MOCK_PORT ?? 4010)
const COLORS = ['verde', 'roxo', 'branco', 'verde', 'vermelho']

function problem(res: import('node:http').ServerResponse, status: number, code: string, detail: string) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/problem+json')
  res.end(JSON.stringify({ type: `about:blank#${code.toLowerCase()}`, title: code, status, code, detail }))
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  if (req.headers['x-api-key'] && url.pathname === '/api/v2/prayer-books') {
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ data: [{ code: 'loc_2027', name: 'Livro fictício 2027' }, { code: 'loc_2015', name: 'Livro fictício 2015' }], meta: {} }))
  }
  // Busca de músicas fictícia no formato do serviço de sugestões do Cifra Club (SONG_SEARCH_URL=http://localhost:4010/cc).
  if (url.pathname === '/cc/') {
    const q = (url.searchParams.get('q') ?? '').trim()
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ response: { docs: [
      { tipo: '1', art: 'Artista de Exemplo', dns: 'artista-de-exemplo' },
      { tipo: '2', art: 'Artista de Exemplo', txt: `${q} (exemplo)`, dns: 'artista-de-exemplo', url: 'cancao-de-exemplo' },
      { tipo: '2', art: 'Outro Artista', txt: `${q} ao vivo (exemplo)`, dns: 'outro-artista', url: 'cancao-ao-vivo' },
    ] } }))
  }
  // Página de cifra fictícia, só com o trecho do tom (SONG_KEY_PAGE_BASE=http://localhost:4010/cifra).
  if (url.pathname.startsWith('/cifra/')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    if (url.pathname.includes('sem-tom')) return res.end('<html><body><h1>Sem tom</h1></body></html>')
    return res.end('<html><body><span id="cifra_tom">tom: <a class="js-modal-trigger" href="#" title="alterar o tom">G</a></span></body></html>')
  }
  const m = url.pathname.match(/^\/api\/v2\/days\/(\d{4})-(\d{2})-(\d{2})$/)
  if (!req.headers['x-api-key']) return problem(res, 401, 'MISSING_API_KEY', 'Envie sua chave no cabeçalho X-API-Key.')
  if (!m) return problem(res, 404, 'NOT_FOUND', 'Rota inexistente.')
  if (url.searchParams.get('falhar')) return problem(res, 503, 'UNAVAILABLE', 'Indisponível.')
  if (!url.searchParams.get('book')) return problem(res, 400, 'MISSING_PRAYER_BOOK', 'A v2 exige o parâmetro \'book\'.')
  const [, y, mo, d] = m
  const n = Number(d)
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({
    data: {
      date: `${y}-${mo}-${d}`,
      season: { slug: 'exemplo', name: 'Tempo Comum (exemplo)' },
      color: COLORS[n % COLORS.length],
      sunday_name: `Domingo de exemplo ${n}`,
      description: [`Próprio ${(n % 29) + 1}`, 'Semana de exemplo'],
      is_sunday: true,
      celebration: n % 7 === 0 ? { name: 'Celebração fictícia', type: 'festival' } : null,
      celebrations: [],
      collect: [{ title: `Domingo de exemplo ${n}`, kind: 'Coleta do Dia', text: 'Texto fictício de coleta, apenas para demonstração local. Amém.' }],
      readings: [
        { slot: 'first_reading', reference: `Gn ${n}.1-10`, alternatives: [] },
        { slot: 'psalm', reference: `Sl ${n + 10}`, alternatives: [] },
        { slot: 'second_reading', reference: `Rm ${(n % 16) + 1}.1-8`, alternatives: [] },
        { slot: 'gospel', reference: `Mt ${(n % 28) + 1}.1-12`, alternatives: [`Mt ${(n % 28) + 1}.1-6`] },
      ],
    },
    meta: { prayer_book: url.searchParams.get('book'), language: 'pt-BR' },
  }))
}).listen(PORT, () => console.log(`[estevao-mock] http://localhost:${PORT} (dados fictícios, API v2)`))
