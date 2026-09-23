import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { getConfig } from '../config'
import * as schema from './schema'

export type Db = NodePgDatabase<typeof schema>
// Transação ou conexão principal: os serviços aceitam os dois.
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
export type DbOrTx = Db | Tx

let pool: pg.Pool | undefined
let db: Db | undefined

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: getConfig().databaseUrl, max: 10 })
  }
  return pool
}

export function getDb(): Db {
  if (!db) db = drizzle(getPool(), { schema })
  return db
}

export function createDb(connectionString: string): { db: Db, pool: pg.Pool } {
  const p = new pg.Pool({ connectionString, max: 10 })
  return { db: drizzle(p, { schema }), pool: p }
}

// Permite que testes e scripts injetem outra conexão.
export function setDb(next: Db, nextPool?: pg.Pool) {
  db = next
  if (nextPool) pool = nextPool
}

export async function closeDb() {
  await pool?.end()
  pool = undefined
  db = undefined
}
