// Regras de liturgia usadas no app e no servidor (exibição, impressão e texto).

// ---------------------------------------------------------------------------
// Texto formatado dos ritos
// ---------------------------------------------------------------------------
// Guardado como texto simples, uma linha por parágrafo:
//   **trecho**   negrito (o que todos dizem juntos)
//   > linha      rubrica (instrução: itálico, vermelho, alinhada à direita)
// Nunca é HTML: quem exibe monta os elementos a partir das partes, sem v-html.

export interface RichPart { text: string, bold: boolean }
export interface RichLine { rubric: boolean, parts: RichPart[] }

export function parseRichText(src: string | null | undefined): RichLine[] {
  if (!src) return []
  return src.replace(/\r\n?/g, '\n').split('\n').map((raw) => {
    const rubric = raw.startsWith('> ') || raw === '>'
    const line = rubric ? raw.slice(2) : raw
    const parts: RichPart[] = []
    const re = /\*\*(.+?)\*\*/g
    let last = 0
    for (let m = re.exec(line); m; m = re.exec(line)) {
      if (m.index > last) parts.push({ text: line.slice(last, m.index), bold: false })
      parts.push({ text: m[1]!, bold: true })
      last = m.index + m[0].length
    }
    if (last < line.length) parts.push({ text: line.slice(last), bold: false })
    return { rubric, parts }
  })
}

export function serializeRichText(lines: RichLine[]): string {
  return lines.map((l) => {
    const body = l.parts.filter((p) => p.text).map((p) => (p.bold && p.text.trim() ? `**${p.text}**` : p.text)).join('')
    return l.rubric ? `> ${body}` : body
  }).join('\n').replace(/\n+$/, '')
}

// Texto sem marcas (busca, comparação, prévia).
export function plainRichText(src: string | null | undefined) {
  return parseRichText(src).map((l) => l.parts.map((p) => p.text).join('')).join('\n')
}

// Para WhatsApp ("Baixar texto"): *negrito* e _rubrica em itálico_.
export function whatsappRichText(src: string | null | undefined) {
  return parseRichText(src).map((l) => {
    const body = l.parts.map((p) => (p.bold && p.text.trim() ? `*${p.text.trim()}*` : p.text)).join('')
    return l.rubric && body.trim() ? `_${body.trim()}_` : body
  }).join('\n')
}

// ---------------------------------------------------------------------------
// Responsórios das leituras
// ---------------------------------------------------------------------------

export interface Response { on: boolean, leader: string, people: string }
// Por posição da leitura: anúncio antes (evangelho), resposta ao final e, para 1ª e 2ª
// leitura, a resposta quando o livro é deuterocanônico.
export interface ReadingResponses { open?: Response, close?: Response, deutero?: Response }

export const EVANGELIST_PLACEHOLDER = '{evangelista}'

export function defaultResponses(slot: string): ReadingResponses {
  switch (slot) {
    case 'psalm':
      return { close: { on: true, leader: 'Glória ao Pai, ao Filho e ao Espírito Santo.', people: 'Como era no princípio, é agora e será sempre, por todos os séculos. Amém.' } }
    case 'gospel':
      return {
        open: { on: false, leader: `O Santo Evangelho de Nosso Senhor Jesus Cristo segundo ${EVANGELIST_PLACEHOLDER}.`, people: 'Glória a vós, Senhor.' },
        close: { on: true, leader: 'Evangelho do Senhor.', people: 'Louvado sejas, ó Cristo.' },
      }
    default:
      return {
        close: { on: true, leader: 'Palavra do Senhor.', people: 'Demos graças a Deus.' },
        deutero: { on: true, leader: 'Aqui termina a leitura.', people: '' },
      }
  }
}

// Completa o que faltar com o padrão (modelos antigos não têm responsórios salvos).
export function responsesFor(slot: string, saved?: ReadingResponses | null): ReadingResponses {
  const d = defaultResponses(slot)
  return {
    ...(d.open ? { open: { ...d.open, ...saved?.open } } : {}),
    ...(d.close ? { close: { ...d.close, ...saved?.close } } : {}),
    ...(d.deutero ? { deutero: { ...d.deutero, ...saved?.deutero } } : {}),
  }
}

const bookOf = (reference: string) => {
  const m = reference.trim().match(/^([1-3]?\s?[A-Za-zÀ-ú]+)\.?\s*(\d+)?/)
  return m ? { book: m[1]!.replace(/\s+/g, '').toLowerCase(), chapter: m[2] ? Number(m[2]) : null } : null
}

// Livros e trechos deuterocanônicos (abreviações em português). "Ecl" é Eclesiastes
// (protocanônico); "Eclo" é Eclesiástico.
const DEUTERO_BOOKS = new Set(['tb', 'tob', 'jt', 'jdt', 'sb', 'sab', 'eclo', 'sir', 'br', 'bar', '1mc', '2mc', '1mac', '2mac'])
export function isDeuterocanonical(reference: string | null | undefined) {
  if (!reference) return false
  const b = bookOf(reference)
  if (!b) return false
  if (DEUTERO_BOOKS.has(b.book)) return true
  // Adições gregas: Daniel 13–14 e Ester 11–16 (numeração da Vulgata).
  if ((b.book === 'dn' || b.book === 'dan') && b.chapter !== null && b.chapter >= 13) return true
  if ((b.book === 'est' || b.book === 'et') && b.chapter !== null && b.chapter >= 11) return true
  return false
}

const EVANGELISTS: Record<string, string> = { mt: 'Mateus', mc: 'Marcos', lc: 'Lucas', jo: 'João' }
export function evangelistOf(reference: string | null | undefined) {
  const b = reference ? bookOf(reference) : null
  return b ? EVANGELISTS[b.book] ?? null : null
}

export interface ResolvedLine { leader: string, people: string }
export interface ResolvedResponses { open?: ResolvedLine, close?: ResolvedLine }

// O que é dito antes e depois desta leitura, já com o evangelista e a troca para
// deuterocanônico. Respostas desligadas ou vazias não aparecem.
export function resolveResponses(slot: string | undefined, reference: string | null | undefined, cfg?: ReadingResponses | null): ResolvedResponses {
  if (!slot) return {}
  const c = responsesFor(slot, cfg)
  const line = (r?: Response): ResolvedLine | undefined => {
    if (!r?.on || !(r.leader.trim() || r.people.trim())) return undefined
    const name = evangelistOf(reference) ?? '…'
    return { leader: r.leader.replaceAll(EVANGELIST_PLACEHOLDER, name).trim(), people: r.people.trim() }
  }
  const close = c.deutero?.on && isDeuterocanonical(reference) ? c.deutero : c.close
  return { open: line(c.open), close: line(close) }
}
