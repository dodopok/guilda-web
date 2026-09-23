import { sql } from 'drizzle-orm'

export default defineApiHandler(async () => {
  await db().execute(sql`select 1`)
  return { ok: true, version: 'v1' }
})
