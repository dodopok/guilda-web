// Apaga e recria o banco LOCAL de desenvolvimento, aplica migrações e dados fictícios.
import './load-env'
import { execSync } from 'node:child_process'
import pg from 'pg'
import { getConfig } from '../server/config'

const url = getConfig().databaseUrl
const host = new URL(url).hostname
if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', 'db'].includes(host)) {
  console.error(`Recusado: db:reset só roda contra banco local (host atual: ${host}).`)
  process.exit(1)
}
const pool = new pg.Pool({ connectionString: url })
await pool.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;')
await pool.end()
execSync('tsx scripts/migrate.ts', { stdio: 'inherit' })
execSync('tsx scripts/seed.ts', { stdio: 'inherit' })
