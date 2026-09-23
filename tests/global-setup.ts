import { readFileSync, existsSync } from 'node:fs'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'

function testUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL
  if (existsSync('.env')) {
    const m = readFileSync('.env', 'utf8').match(/^TEST_DATABASE_URL=(.*)$/m)
    if (m?.[1]) return m[1].trim()
  }
  return 'postgres://guilda:guilda@localhost:5432/guilda_test'
}

// Recria o esquema do banco de testes e aplica as migrações uma vez por execução.
export default async function setup() {
  const url = testUrl()
  process.env.TEST_DATABASE_URL = url
  if (!/_test\b|test/.test(new URL(url).pathname)) throw new Error(`Recuso limpar um banco que não parece de teste: ${url}`)
  const pool = new pg.Pool({ connectionString: url })
  await pool.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;')
  await migrate(drizzle(pool), { migrationsFolder: 'server/db/migrations' })
  await pool.end()
}
