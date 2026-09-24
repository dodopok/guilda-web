import { describe, expect, it, vi } from 'vitest'
import { extractKey, isCifraLink, lookupCifraKey } from '../../server/integrations/cifraclub'

const cfg = { url: 'https://busca.example.test/cc', pageBase: 'https://cifra.example.test', timeoutMs: 1000 }

describe('tom da cifra (Cifra Club)', () => {
  it('lê só o tom do trecho #cifra_tom', () => {
    expect(extractKey('<p>x</p><span id="cifra_tom">tom: <a href="#" title="alterar o tom">G</a></span><pre>C G Am</pre>')).toBe('G')
    expect(extractKey('<span id="cifra_tom" class="x">Tom: <b>F#m</b></span>')).toBe('F#m')
    expect(extractKey('<span id="cifra_tom">tom: <a>Bb</a> (forma dos acordes no tom de A)</span>')).toBe('Bb')
    expect(extractKey('<span id="cifra_tom">tom: <a>Ebm</a></span>')).toBe('Ebm')
    expect(extractKey('<pre>tom: G</pre>')).toBeNull()
    expect(extractKey('<span id="cifra_tom">tom: <a>H</a></span>')).toBeNull()
  })

  it('aceita só links de cifra do Cifra Club e pede a página no endereço configurado', async () => {
    expect(isCifraLink('https://www.cifraclub.com.br/artista/musica/')).toBe(true)
    expect(isCifraLink('https://www.cifraclub.com.br/../x/')).toBe(false)
    expect(isCifraLink('https://outro.site/artista/musica/')).toBe(false)
    const ok = vi.fn(async () => new Response('<span id="cifra_tom">tom: <a>D</a></span>', { status: 200 }))
    expect(await lookupCifraKey({ ...cfg, fetchImpl: ok as unknown as typeof fetch }, 'https://www.cifraclub.com.br/artista/musica-d/')).toEqual({ status: 'found', key: 'D' })
    expect((ok.mock.calls[0] as unknown as [string])[0]).toBe('https://cifra.example.test/artista/musica-d/')
    expect(await lookupCifraKey({ ...cfg, fetchImpl: ok as unknown as typeof fetch }, 'https://evil.test/a/b/')).toMatchObject({ status: 'not_found' })
  })

  it('página recusada (403) ou sem tom não quebra', async () => {
    const denied = vi.fn(async () => new Response('Access Denied', { status: 403 }))
    expect(await lookupCifraKey({ ...cfg, fetchImpl: denied as unknown as typeof fetch }, 'https://www.cifraclub.com.br/artista/bloqueada/'))
      .toEqual({ status: 'unavailable', reason: 'O Cifra Club recusou a leitura da página.' })
    const none = vi.fn(async () => new Response('<html></html>', { status: 200 }))
    expect(await lookupCifraKey({ ...cfg, fetchImpl: none as unknown as typeof fetch }, 'https://www.cifraclub.com.br/artista/sem-tom/')).toMatchObject({ status: 'not_found' })
    expect(await lookupCifraKey({ ...cfg, pageBase: '' }, 'https://www.cifraclub.com.br/artista/qualquer/')).toMatchObject({ status: 'unavailable' })
  })
})
