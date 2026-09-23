import { describe, expect, it } from 'vitest'
import { displayPhone, maskPhoneBR, normalizePhoneBR } from '../../app/utils/phone'
import { normalizePhone } from '../../server/lib/phone'

describe('máscara de celular brasileiro', () => {
  it('formata enquanto digita, sem +55', () => {
    expect(maskPhoneBR('5')).toBe('(5')
    expect(maskPhoneBR('51')).toBe('(51')
    expect(maskPhoneBR('519')).toBe('(51) 9')
    expect(maskPhoneBR('5199999')).toBe('(51) 9999-9')
    expect(maskPhoneBR('51999990004')).toBe('(51) 99999-0004')
    expect(maskPhoneBR('5133330004')).toBe('(51) 3333-0004')
    expect(maskPhoneBR('519999900041234')).toBe('(51) 99999-0004')
  })
  it('mostra números guardados em E.164 sem o +55; estrangeiros ficam como estão', () => {
    expect(displayPhone('+5551999990004')).toBe('(51) 99999-0004')
    expect(maskPhoneBR('+55 51 99999-0004')).toBe('(51) 99999-0004')
    expect(displayPhone('+351912345678')).toBe('+351912345678')
    expect(maskPhoneBR('+351 912')).toBe('+351 912')
    expect(displayPhone(null)).toBeNull()
  })
  it('o valor mascarado chega ao mesmo E.164 no servidor e no navegador', () => {
    for (const raw of ['51999990004', '+5551999990004', '(51) 3333-0004']) {
      const masked = maskPhoneBR(raw)
      expect(normalizePhone(masked)).toBe(normalizePhoneBR(masked))
      expect(normalizePhone(masked)).toBe(normalizePhone(raw))
    }
  })
})
