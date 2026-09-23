import { defineConfig, devices } from '@playwright/test'
import { E2E_BASE_URL, e2eEnv } from './tests/e2e/env'

// Testes ponta a ponta contra o build de produção (rode "pnpm build" antes).
// O setup recria o banco guilda_e2e, aplica migrações, carrega dados fictícios e sobe
// o trabalhador e o Estêvão simulado.
export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: E2E_BASE_URL,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined },
  },
  projects: [
    { name: 'celular', use: { ...devices['Pixel 7'] }, testMatch: /.*\.mobile\.spec\.ts/ },
    { name: 'desktop', use: { viewport: { width: 1366, height: 900 } }, testMatch: /^(?!.*mobile).*\.spec\.ts$/ },
  ],
  webServer: {
    command: 'npx tsx tests/e2e/prepare.ts && node .output/server/index.mjs',
    url: `${E2E_BASE_URL}/api/v1/health`,
    env: e2eEnv(),
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
