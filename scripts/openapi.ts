// Gera docs/openapi.json a partir de server/api-spec.ts.
import { writeFileSync } from 'node:fs'
import { buildOpenApi } from '../server/api-spec'

writeFileSync('docs/openapi.json', `${JSON.stringify(buildOpenApi(), null, 2)}\n`)
console.log('docs/openapi.json atualizado.')
