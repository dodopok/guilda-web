// Recria o banco guilda_e2e com migrações e dados fictícios antes de subir o servidor.
import { execSync } from 'node:child_process'
import pg from 'pg'
import { E2E_DB, e2eEnv } from './env'

const url = new URL(E2E_DB)
const dbName = url.pathname.slice(1)
if (!dbName.includes('e2e')) throw new Error(`Banco de e2e inesperado: ${dbName}`)
const admin = new URL(E2E_DB)
admin.pathname = '/guilda'
const pool = new pg.Pool({ connectionString: admin.toString() })
const exists = await pool.query('select 1 from pg_database where datname = $1', [dbName])
if (!exists.rowCount) await pool.query(`create database ${dbName}`)
await pool.end()
const db = new pg.Pool({ connectionString: E2E_DB })
await db.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;')
await db.end()
const env = { ...process.env, ...e2eEnv() }
execSync('npx tsx scripts/migrate.ts', { env, stdio: 'inherit' })
execSync('npx tsx scripts/seed.ts', { env, stdio: 'ignore' })
