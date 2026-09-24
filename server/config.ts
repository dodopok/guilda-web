// Configuração lida do ambiente. Sem dependência do Nuxt para poder ser usada pelo
// trabalhador, pelos scripts e pelos testes.

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback
  return ['1', 'true', 'yes', 'sim'].includes(value.toLowerCase())
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function getConfig() {
  const env = process.env
  return {
    databaseUrl: env.DATABASE_URL ?? 'postgres://guilda:guilda@localhost:5432/guilda',
    appBaseUrl: (env.APP_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
    sessionCookieSecure: bool(env.SESSION_COOKIE_SECURE, false),
    sessionTtlDays: int(env.SESSION_TTL_DAYS, 30),
    secretsEncryptionKey: env.SECRETS_ENCRYPTION_KEY ?? '',
    scryptLog2N: int(env.PASSWORD_SCRYPT_LOG2N, 17),
    whatsapp: {
      allowRealSend: bool(env.WHATSAPP_ALLOW_REAL_SEND, false),
      graphBaseUrl: (env.WHATSAPP_GRAPH_BASE_URL ?? 'https://graph.facebook.com').replace(/\/$/, ''),
      graphVersion: env.WHATSAPP_GRAPH_VERSION ?? 'v25.0',
      ycloudBaseUrl: (env.YCLOUD_API_BASE_URL ?? 'https://api.ycloud.com').replace(/\/$/, ''),
    },
    estevao: {
      url: (env.ESTEVAO_API_URL ?? '').replace(/\/$/, ''),
      apiKey: env.ESTEVAO_API_KEY ?? '',
      prayerBook: env.ESTEVAO_PRAYER_BOOK ?? 'loc_2027',
      readingType: env.ESTEVAO_READING_TYPE ?? 'complementary',
      timeoutMs: int(env.ESTEVAO_TIMEOUT_MS, 8000),
    },
    // Busca de músicas no Cifra Club (SONG_SEARCH_URL vazio desliga).
    songSearch: {
      url: (env.SONG_SEARCH_URL ?? 'https://solr.sscdn.co/cc/c1').replace(/\/$/, ''),
      // Páginas de cifra, para ler só o tom original (SONG_KEY_PAGE_BASE vazio desliga).
      pageBase: (env.SONG_KEY_PAGE_BASE ?? 'https://www.cifraclub.com.br').replace(/\/$/, ''),
      timeoutMs: int(env.SONG_SEARCH_TIMEOUT_MS, 5000),
    },
    worker: {
      intervalSeconds: int(env.WORKER_INTERVAL_SECONDS, 30),
      reminderCatchupHours: int(env.REMINDER_CATCHUP_HOURS, 6),
    },
  }
}

export type AppConfig = ReturnType<typeof getConfig>
