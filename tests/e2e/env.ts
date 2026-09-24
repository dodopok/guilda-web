export const E2E_PORT = 3100
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`
export const E2E_DB = process.env.E2E_DATABASE_URL ?? 'postgres://guilda:guilda@localhost:5432/guilda_e2e'
export const MOCK_PORT = 4011

export function e2eEnv(): Record<string, string> {
  return {
    PORT: String(E2E_PORT),
    NITRO_PORT: String(E2E_PORT),
    DATABASE_URL: E2E_DB,
    APP_BASE_URL: E2E_BASE_URL,
    SESSION_COOKIE_SECURE: 'false',
    SECRETS_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
    PASSWORD_SCRYPT_LOG2N: '12',
    WHATSAPP_ALLOW_REAL_SEND: 'false',
    ESTEVAO_API_URL: `http://localhost:${MOCK_PORT}`,
    ESTEVAO_API_KEY: 'e2e-mock',
    SONG_SEARCH_URL: `http://localhost:${MOCK_PORT}/cc`,
    WORKER_INTERVAL_SECONDS: '1',
    REMINDER_CATCHUP_HOURS: '6',
    ESTEVAO_MOCK_PORT: String(MOCK_PORT),
    RATE_LIMIT_FACTOR: '50',
  }
}
