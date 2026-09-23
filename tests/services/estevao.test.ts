import { describe, expect, it } from 'vitest'
import { EstevaoError, dayPath, fetchLiturgicalDay, normalizeDay, sundayTitle } from '../../server/integrations/estevao'

const cfg = { url: 'https://estevao.example.test', apiKey: 'k', timeoutMs: 1000 }
const prefs = { prayerBook: 'loc_2015', readingType: 'complementary' }

describe('cliente do Estêvão (v2)', () => {
  it('pede só referências, com livro obrigatório, eucaristia e tipo de leitura', () => {
    const path = dayPath('2026-10-11', prefs)
    const q = new URL(`https://x${path}`).searchParams
    expect(path.startsWith('/api/v2/days/2026-10-11?')).toBe(true)
    expect(q.get('book')).toBe('loc_2015')
    expect(q.get('service')).toBe('eucharist')
    expect(q.get('reading_type')).toBe('complementary')
    expect(q.get('include')!.split(',')).not.toContain('readings.text')
  })

  it('normaliza lista de leituras com slot, alternativas em texto ou objeto e cor em inglês', () => {
    const s = normalizeDay({
      data: {
        date: '2026-10-11',
        color: 'green',
        season: { name: 'Tempo Comum' },
        readings: [
          { slot: 'old_testament', reference: 'Is 25.1-9', alternatives: [{ reference: 'Ex 32.1-14' }] },
          { slot: 'gospel', reference: 'Mt 22.1-14', alternatives: ['Mt 22.1-10'] },
          { slot: 'canticle', reference: 'Cântico 9' },
        ],
        collect: [{ title: null, kind: 'Coleta do Dia', text: 'Texto.' }, { title: 'Vazia', text: null }],
      },
    })
    expect(s.color).toBe('verde')
    expect(s.season).toBe('Tempo Comum')
    expect(s.readings).toEqual([
      { key: 'old_testament', label: 'Primeira leitura', reference: 'Is 25.1-9', alternatives: ['Ex 32.1-14'] },
      { key: 'gospel', label: 'Evangelho', reference: 'Mt 22.1-14', alternatives: ['Mt 22.1-10'] },
      { key: 'canticle', label: 'Leitura', reference: 'Cântico 9', alternatives: [] },
    ])
    expect(s.collects).toEqual([{ title: 'Coleta do Dia', text: 'Texto.' }])
  })

  it('extrai o Próprio da descrição e monta o nome do domingo sem repetir', () => {
    const s = normalizeDay({ data: { date: '2026-10-11', sunday_name: '19º Domingo no Tempo Comum', description: ['28ª Semana', ' Próprio 23 '] } })
    expect(s.proper).toBe('Próprio 23')
    expect(sundayTitle(s)).toBe('19º Domingo no Tempo Comum (Próprio 23)')
    expect(sundayTitle({ sundayName: 'Domingo Próprio 23', proper: 'Próprio 23' })).toBe('Domingo Próprio 23')
    const advent = normalizeDay({ data: { date: '2026-11-29', sunday_name: '1º Domingo do Advento', description: ['Semana do Advento'] } })
    expect(advent.proper).toBeNull()
    expect(sundayTitle(advent)).toBe('1º Domingo do Advento')
    expect(sundayTitle({ sundayName: null, proper: null })).toBeNull()
  })

  it('traduz erros problem+json pelo código estável', async () => {
    const problem = (status: number, code: string) => async () => new Response(JSON.stringify({ status, code }), { status, headers: { 'content-type': 'application/problem+json' } })
    await expect(fetchLiturgicalDay({ ...cfg, fetchImpl: problem(429, 'RATE_LIMITED') as typeof fetch }, '2026-10-11', prefs))
      .rejects.toMatchObject({ kind: 'http', status: 429, code: 'RATE_LIMITED', message: expect.stringContaining('limite') })
    await expect(fetchLiturgicalDay({ ...cfg, fetchImpl: problem(422, 'UNKNOWN_PRAYER_BOOK') as typeof fetch }, '2026-10-11', prefs))
      .rejects.toMatchObject({ message: expect.stringContaining('livro de oração') })
    await expect(fetchLiturgicalDay({ ...cfg, url: '' }, '2026-10-11', prefs)).rejects.toBeInstanceOf(EstevaoError)
  })
})
