// Cor da igreja: a partir de uma cor, derivamos as variações usadas no app (texto sobre a
// cor, tom escuro para textos, fundo suave e fundo da página), garantindo legibilidade.
const hex2rgb = (h: string) => {
  const n = Number.parseInt(h.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const
}
const rgb2hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`
export function mix(a: string, b: string, t: number) {
  const A = hex2rgb(a)
  const B = hex2rgb(b)
  return rgb2hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t)
}
function lum(h: string) {
  const [r, g, b] = hex2rgb(h).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contrast(a: string, b: string) {
  const la = lum(a)
  const lb = lum(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export const DEFAULT_ACCENT = '#2c5a41'
export const SWATCHES = ['#2c5a41', '#1f6f8b', '#7a4bd6', '#c2561c', '#b3266e', '#1c1a16']

export function accentPalette(input?: string | null) {
  const accent = /^#[0-9a-f]{6}$/i.test(input ?? '') ? input!.toLowerCase() : DEFAULT_ACCENT
  const onWhite = contrast(accent, '#ffffff')
  const ink = onWhite >= 3.2 ? '#ffffff' : '#1d221f'
  return {
    accent,
    ink,
    deep: ink === '#ffffff' ? mix(accent, '#000000', 0.22) : mix(accent, '#000000', 0.45),
    soft: mix(accent, '#ffffff', 0.88),
    mid: mix(accent, '#ffffff', 0.62),
    page: mix(accent, '#faf9f6', 0.95),
    onWhite,
  }
}

export function accentStyle(input?: string | null) {
  const p = accentPalette(input)
  return `--accent:${p.accent};--accent-ink:${p.ink};--accent-deep:${p.deep};--accent-soft:${p.soft};--accent-mid:${p.mid};--page:${p.page}`
}

export function contrastMessage(input?: string | null) {
  const p = accentPalette(input)
  if (p.onWhite >= 4.5) return 'Contraste ótimo: texto branco fica legível sobre a cor.'
  if (p.ink === '#ffffff') return 'Contraste razoável em botões. Textos usam um tom mais escuro.'
  return 'Cor clara: usamos texto escuro por cima para ficar legível.'
}

// Cores mais presentes numa imagem (ignora quase-brancos, quase-pretos e cinzas).
export function extractPalette(img: HTMLImageElement): string[] {
  const c = document.createElement('canvas')
  c.width = 48
  c.height = 48
  const ctx = c.getContext('2d')
  if (!ctx) return []
  ctx.drawImage(img, 0, 0, 48, 48)
  const d = ctx.getImageData(0, 0, 48, 48).data
  const buckets: Record<string, { n: number, r: number, g: number, b: number }> = {}
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]!
    const g = d[i + 1]!
    const b = d[i + 2]!
    if (d[i + 3]! < 128) continue
    const mx = Math.max(r, g, b)
    const mn = Math.min(r, g, b)
    if (mx - mn < 28 || mx > 245 || mx < 25) continue
    const k = [r, g, b].map((v) => Math.round(v / 32)).join(',')
    const bucket = (buckets[k] ??= { n: 0, r: 0, g: 0, b: 0 })
    bucket.n++
    bucket.r += r
    bucket.g += g
    bucket.b += b
  }
  return Object.values(buckets).sort((x, y) => y.n - x.n).slice(0, 4).map((v) => rgb2hex(v.r / v.n, v.g / v.n, v.b / v.n))
}

export function initials(name: string) {
  return name.replace(/^(Pr|Pra|Rev|Revda?)\.\s*/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

// Bolinha da cor litúrgica.
const LITURGICAL_HEX: Record<string, string> = { verde: '#3f8a5e', roxo: '#7a5aa6', branco: '#c9a94a', dourado: '#c9a94a', vermelho: '#c2453a', rosa: '#d17aa3', azul: '#4c7ab8', preto: '#3a3835' }
export function liturgicalHex(color?: string | null) {
  const key = liturgicalKey(color)
  return key ? LITURGICAL_HEX[key]! : null
}
