// https://nuxt.com/docs/4.x/api/nuxt-config
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  // Links de convite e de senha trazem o token na URL: nunca enviar Referer.
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "font-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
}

export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  modules: ['@nuxt/eslint'],
  devtools: { enabled: false },
  // Aplicação autenticada: renderização no navegador; a API é o contrato público.
  ssr: false,
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      htmlAttrs: { lang: 'pt-BR' },
      title: 'Guilda',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#f7f4ee' },
        { name: 'description', content: 'Escalas, confirmações e roteiros de culto.' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
  routeRules: {
    '/**': { headers: securityHeaders },
    '/api/**': { headers: { 'Cache-Control': 'no-store' } },
  },
  typescript: { strict: true },
  eslint: { config: { stylistic: true } },
  nitro: {
    // O trabalhador roda em processo separado (pnpm worker); nada agendado dentro do web.
    experimental: { tasks: false },
  },
})
