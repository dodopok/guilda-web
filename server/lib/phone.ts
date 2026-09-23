// Telefones em E.164. Números brasileiros sem código do país recebem +55.
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null
  const trimmed = input.trim()
  if (!trimmed) return null
  let digits = trimmed.replace(/\D/g, '')
  if (trimmed.startsWith('+')) {
    // já tem código do país
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2)
  } else if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`
  }
  if (digits.length < 10 || digits.length > 15) return null
  return `+${digits}`
}

// Para logs e telas sem permissão de contato: mostra só os quatro últimos dígitos.
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  return `•••• ${phone.slice(-4)}`
}
