import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import type { Db } from './client'

export const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'migrations')

export async function runMigrations(db: Db, folder = migrationsFolder) {
  await migrate(db, { migrationsFolder: folder })
}
