// Passo pré-implantação (Railway "preDeployCommand" ou equivalente), antes de trocar a versão:
//   1. confere variáveis obrigatórias em produção e para se houver algo inseguro;
//   2. aplica as migrações;
//   3. cria a primeira conta de administração da plataforma, se pedida por variáveis.
// É idempotente: rodar de novo não duplica nada e nunca troca a senha de uma conta existente.
import './load-env'
import { eq } from 'drizzle-orm'
import { getConfig } from '../server/config'
import { closeDb, getDb } from '../server/db/client'
import { runMigrations } from '../server/db/migrate'
import { accounts } from '../server/db/schema'
import { hashPassword } from '../server/lib/crypto'
import { normalizePhone } from '../server/lib/phone'

const cfg = getConfig()
const problems: string[] = []
if (!process.env.DATABASE_URL) problems.push('DATABASE_URL não definida.')
if (!/^https:\/\//.test(cfg.appBaseUrl)) problems.push('APP_BASE_URL precisa ser o endereço público com https:// (vai nos links do WhatsApp).')
if (!cfg.sessionCookieSecure) problems.push('SESSION_COOKIE_SECURE precisa ser true fora do computador local.')
if (Buffer.from(cfg.secretsEncryptionKey, 'base64').length !== 32) problems.push('SECRETS_ENCRYPTION_KEY precisa ter 32 bytes em base64 (cifra as chaves do WhatsApp).')
if (cfg.scryptLog2N < 17) problems.push('PASSWORD_SCRYPT_LOG2N abaixo de 17 é só para testes.')
if (problems.length) {
  console.error('[predeploy] Configuração insegura ou incompleta; nada foi alterado:')
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
if (cfg.whatsapp.allowRealSend) console.warn('[predeploy] Atenção: WHATSAPP_ALLOW_REAL_SEND=true — envio real liberado no servidor (cada igreja ainda precisa cumprir a lista do canal).')

const db = getDb()
await runMigrations(db)
console.log('[predeploy] Migrações aplicadas.')

// Primeira administração: BOOTSTRAP_ADMIN_PHONE (+ nome e senha). Use o seu próprio celular:
// ao criar a igreja com você na coordenação, a conta é ligada sem precisar de convite.
const phoneRaw = process.env.BOOTSTRAP_ADMIN_PHONE
if (phoneRaw) {
  const login = normalizePhone(phoneRaw)
  if (!login) {
    console.error('[predeploy] BOOTSTRAP_ADMIN_PHONE inválido.')
    process.exit(1)
  }
  const existing = await db.query.accounts.findFirst({ where: eq(accounts.login, login) })
  if (existing) {
    if (!existing.isPlatformAdmin) await db.update(accounts).set({ isPlatformAdmin: true }).where(eq(accounts.id, existing.id))
    console.log('[predeploy] Conta de administração já existe; senha mantida. Pode apagar BOOTSTRAP_ADMIN_PASSWORD.')
  } else {
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? ''
    if (password.length < 12) {
      console.error('[predeploy] BOOTSTRAP_ADMIN_PASSWORD precisa de pelo menos 12 caracteres para criar a conta.')
      process.exit(1)
    }
    await db.insert(accounts).values({ login, passwordHash: await hashPassword(password), displayName: process.env.BOOTSTRAP_ADMIN_NAME?.trim() || 'Administração', isPlatformAdmin: true, passwordChangedAt: new Date() })
    console.log(`[predeploy] Conta de administração criada (final ${login.slice(-4)}). Apague BOOTSTRAP_ADMIN_PASSWORD das variáveis.`)
  }
}
await closeDb()
