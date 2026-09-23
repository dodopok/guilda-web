import './load-env'
import { closeDb, getDb } from '../server/db/client'
import { runMigrations } from '../server/db/migrate'

await runMigrations(getDb())
console.log('Migrações aplicadas.')
await closeDb()
