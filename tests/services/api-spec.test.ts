import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROUTES, buildOpenApi } from '../../server/api-spec'

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const full = path.join(dir, f)
    return statSync(full).isDirectory() ? routeFiles(full) : [full]
  })
}

// Converte server/api/v1/churches/[church]/people/[id]/index.patch.ts em "patch /api/v1/churches/{church}/people/{id}".
function toRoute(file: string) {
  const rel = file.replace(/\\/g, '/').replace(/^server\/api/, '/api').replace(/\.ts$/, '')
  const m = rel.match(/^(.*)\.(get|post|put|patch|delete)$/)
  if (!m) return null
  const p = m[1]!.replace(/\/index$/, '').replace(/\[(\w+)\]/g, '{$1}')
  return `${m[2]} ${p}`
}

describe('documentação da API', () => {
  it('toda rota v1 está no OpenAPI e vice-versa', () => {
    const files = routeFiles('server/api/v1').map(toRoute).filter((x): x is string => Boolean(x)).sort()
    const documented = ROUTES.map((r) => `${r.method} ${r.path}`).sort()
    expect(documented).toEqual(files)
  })

  it('o arquivo docs/openapi.json está atualizado', () => {
    const current = JSON.parse(readFileSync('docs/openapi.json', 'utf8'))
    expect(current).toEqual(JSON.parse(JSON.stringify(buildOpenApi())))
  })
})
