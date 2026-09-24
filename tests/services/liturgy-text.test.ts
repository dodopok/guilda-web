import { describe, expect, it } from 'vitest'
import { evangelistOf, isDeuterocanonical, parseRichText, plainRichText, resolveResponses, responsesFor, serializeRichText, whatsappRichText } from '../../shared/liturgy'

describe('texto formatado dos ritos', () => {
  it('lê e grava negrito e rubrica sem perder nada', () => {
    const src = 'O Senhor esteja convosco.\n**E contigo também.**\n> Todos se ajoelham.\nOremos: **Amém.** fim'
    const lines = parseRichText(src)
    expect(lines[1]).toEqual({ rubric: false, parts: [{ text: 'E contigo também.', bold: true }] })
    expect(lines[2]).toEqual({ rubric: true, parts: [{ text: 'Todos se ajoelham.', bold: false }] })
    expect(lines[3]!.parts).toEqual([{ text: 'Oremos: ', bold: false }, { text: 'Amém.', bold: true }, { text: ' fim', bold: false }])
    expect(serializeRichText(lines)).toBe(src)
    expect(plainRichText(src)).toBe('O Senhor esteja convosco.\nE contigo também.\nTodos se ajoelham.\nOremos: Amém. fim')
    expect(whatsappRichText(src)).toBe('O Senhor esteja convosco.\n*E contigo também.*\n_Todos se ajoelham._\nOremos: *Amém.* fim')
  })

  it('texto antigo sem marcas continua igual', () => {
    expect(serializeRichText(parseRichText('Linha 1\n\nLinha 3'))).toBe('Linha 1\n\nLinha 3')
    expect(parseRichText(null)).toEqual([])
  })
})

describe('responsórios das leituras', () => {
  it('reconhece deuterocanônicos e o evangelista', () => {
    for (const r of ['Sb 1.13-15', 'Eclo 27.4-7', 'Br 5.1-9', '2Mc 7.1-2', '1 Mc 2.15', 'Tb 3.1', 'Jt 8.1', 'Dn 13.1-9', 'Est 14.1']) expect(isDeuterocanonical(r)).toBe(true)
    for (const r of ['Ecl 1.2', 'Is 25.1-9', 'Dn 7.9-14', 'Est 4.1', 'Am 5.18-24', '']) expect(isDeuterocanonical(r)).toBe(false)
    expect(evangelistOf('Mt 22.1-14')).toBe('Mateus')
    expect(evangelistOf('Jo 1.1')).toBe('João')
    expect(evangelistOf('Rm 8.1')).toBeNull()
  })

  it('padrões: Palavra do Senhor, Glória ao Pai, Evangelho do Senhor; anúncio do evangelho desligado', () => {
    expect(resolveResponses('first_reading', 'Is 25.1-9', null)).toEqual({ close: { leader: 'Palavra do Senhor.', people: 'Demos graças a Deus.' } })
    expect(resolveResponses('first_reading', 'Sb 1.13-15', null)).toEqual({ close: { leader: 'Aqui termina a leitura.', people: '' } })
    expect(resolveResponses('psalm', 'Sl 23', null).close!.people).toBe('Como era no princípio, é agora e será sempre, por todos os séculos. Amém.')
    expect(resolveResponses('gospel', 'Lc 2.1-14', null)).toEqual({ close: { leader: 'Evangelho do Senhor.', people: 'Louvado sejas, ó Cristo.' } })
  })

  it('configuração da igreja: liga o anúncio com o evangelista, desliga respostas', () => {
    const cfg = responsesFor('gospel')
    cfg.open!.on = true
    expect(resolveResponses('gospel', 'Mc 1.1-8', cfg).open).toEqual({ leader: 'O Santo Evangelho de Nosso Senhor Jesus Cristo segundo Marcos.', people: 'Glória a vós, Senhor.' })
    expect(resolveResponses('psalm', 'Sl 23', { close: { on: false, leader: 'x', people: 'y' } })).toEqual({})
    // Deuterocanônico desligado: fica a resposta normal.
    expect(resolveResponses('second_reading', 'Eclo 3.1', { deutero: { on: false, leader: 'Aqui termina a leitura.', people: '' } }).close!.leader).toBe('Palavra do Senhor.')
    expect(resolveResponses(undefined, 'Is 1.1', null)).toEqual({})
  })
})
