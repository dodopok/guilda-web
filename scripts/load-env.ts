// Carrega .env para scripts executados fora do Nuxt (tsx). Variáveis já definidas prevalecem.
import { existsSync, readFileSync } from 'node:fs'

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!match) continue
    const [, key, raw] = match
    if (process.env[key!] !== undefined) continue
    process.env[key!] = raw!.replace(/^['"]|['"]$/g, '')
  }
}
