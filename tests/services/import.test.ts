import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { assignments, personAliases, services } from '../../server/db/schema'
import { applyImport, parseSheet, previewImport } from '../../server/services/import'
import { publishMonth } from '../../server/services/schedule'
import { makeChurch, useDb } from '../helpers'

// Planilha fictícia no formato observado: data só no início do bloco, vários nomes numa
// célula, "?" como responsável indefinido, grafia sem acento e apelido.
const CSV = [
  'DATA;MINISTÉRIO;VOLUNTÁRIO',
  '01/11/2026;LITURGIA - ABERTURA;Ana Lima',
  ';LITURGIA - LEITURA;Ana Lima, Bruno Reis',
  ';HOLYRICS;Carla',
  ';SERMÃO;?',
  ';CAFÉ DA MANHÃ;ana lima',
  '08/11/2026;LITURGIA - ABERTURA;Beto',
  ';LOUVOR;Carla Dias e Bruno Reis',
  ';FUNÇÃO INEXISTENTE;Ana Lima',
].join('\n')

describe('importação da planilha', () => {
  const db = useDb()

  it('propaga a data do bloco e separa nomes', () => {
    const rows = parseSheet(CSV, '2026-11')
    expect(rows.map((r) => r.date)).toEqual(['2026-11-01', '2026-11-01', '2026-11-01', '2026-11-01', '2026-11-01', '2026-11-08', '2026-11-08', '2026-11-08'])
    expect(rows[1]!.names).toEqual(['Ana Lima', 'Bruno Reis'])
    expect(rows[6]!.names).toEqual(['Carla Dias', 'Bruno Reis'])
  })

  it('prévia aponta ambiguidades sem criar pessoas; aplicação é idempotente', async () => {
    const f = await makeChurch(db(), 'porto')
    const preview = await previewImport(db(), f.coord.ctx, { month: '2026-11', csv: CSV })
    expect(preview.summary.unknownDuties).toEqual(['FUNÇÃO INEXISTENTE'])
    const byRaw = new Map(preview.rows.flatMap((r) => r.people).map((p) => [p.raw, p]))
    expect(byRaw.get('ana lima')!.status).toBe('ok')
    expect(byRaw.get('Carla')!.status).toBe('suggested')
    expect(byRaw.get('Beto')!.status).toBe('unknown')
    expect(preview.rows.find((r) => r.label === 'SERMÃO')!.issues).toContain('responsável indefinido (?)')

    const resolutions = { duties: { 'funcao inexistente': 'ignore' }, people: { carla: f.carla.id, beto: f.bruno.id } }
    const first = await applyImport(db(), f.coord.ctx, { month: '2026-11', csv: CSV, resolutions })
    expect(first.alreadyImported).toBe(false)
    expect(first.servicesCreated).toBe(2)
    const count1 = (await db().select().from(assignments)).length
    expect(count1).toBe(first.assignmentsCreated)
    // Beto (Bruno) na Abertura não é habilitado: entra como designação excepcional.
    expect(first.exceptional).toBeGreaterThan(0)
    expect(await db().select().from(personAliases).where(eq(personAliases.aliasKey, 'beto'))).toHaveLength(1)

    const again = await applyImport(db(), f.coord.ctx, { month: '2026-11', csv: CSV, resolutions })
    expect(again.alreadyImported).toBe(true)
    // Mesmo conteúdo com linha extra (outro "arquivo"): não duplica o que já existe.
    const third = await applyImport(db(), f.coord.ctx, { month: '2026-11', csv: `${CSV}\n`.concat(';AVISOS;Ana Lima'), resolutions })
    expect(third.alreadyAssigned).toBe(count1)
    expect(await db().select().from(services)).toHaveLength(2)
    // O apelido salvo resolve "Beto" sozinho na próxima prévia.
    const p2 = await previewImport(db(), f.coord.ctx, { month: '2026-11', csv: CSV })
    expect(p2.rows.flatMap((r) => r.people).find((p) => p.raw === 'Beto')!.status).toBe('ok')

    await publishMonth(db(), f.coord.ctx, '2026-11', { notifyNow: false })
    await expect(applyImport(db(), f.coord.ctx, { month: '2026-11', csv: `${CSV}\n;X;Y` })).rejects.toMatchObject({ code: 'month_published' })
    await expect(previewImport(db(), f.ana.ctx, { month: '2026-11', csv: CSV })).rejects.toMatchObject({ status: 403 })
  })
})
