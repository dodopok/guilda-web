// Celulares brasileiros: exibição "(51) 99999-9999" sem +55. Números de outros países
// (digitados com + e código diferente de 55) ficam como estão.

// Formata enquanto a pessoa digita. Aceita valor já em E.164 (+5551...).
export function maskPhoneBR(value: string): string {
  const v = value.trimStart()
  if (v.startsWith('+') && !v.startsWith('+55')) return v
  let d = v.replace(/\D/g, '')
  if (v.startsWith('+55') || (d.length > 11 && d.startsWith('55'))) d = d.slice(2)
  d = d.slice(0, 11)
  if (!d) return ''
  if (d.length <= 2) return `(${d}`
  const ddd = d.slice(0, 2)
  const rest = d.slice(2)
  if (rest.length <= 4) return `(${ddd}) ${rest}`
  const split = rest.length === 9 ? 5 : 4
  return `(${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`
}

// Para mostrar um telefone guardado (E.164). Vazio vira null.
export function displayPhone(e164: string | null | undefined): string | null {
  if (!e164) return null
  return e164.startsWith('+55') || !e164.startsWith('+') ? maskPhoneBR(e164) : e164
}

// Mesmo critério do servidor (server/lib/phone.ts), para comparar sem ida ao servidor.
export function normalizePhoneBR(input: string | null | undefined): string | null {
  const t = (input ?? '').trim()
  if (!t) return null
  let d = t.replace(/\D/g, '')
  if (t.startsWith('+')) { /* já tem código do país */ } else if (d.startsWith('00')) d = d.slice(2)
  else if (d.length === 10 || d.length === 11) d = `55${d}`
  return d.length >= 10 && d.length <= 15 ? `+${d}` : null
}
