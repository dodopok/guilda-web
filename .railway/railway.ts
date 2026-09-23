// Projeto da Guilda no Railway (Infrastructure as Code). Aplicar com:
//   railway login && railway link      (ou deixe o CLI perguntar)
//   railway config plan                (mostra o que muda; não altera nada)
//   railway config apply               (cria/atualiza, pedindo confirmação)
// Segredos NÃO ficam aqui: estão como preserve() e são definidos uma vez pelo CLI
// (ver docs/implantacao-railway.md). O domínio gerado do Railway também não entra aqui.
import { defineRailway, github, group, postgres, preserve, project, service } from 'railway/iac'

const REPO = 'dodopok/guilda-web'
// Branch implantada. Troque para "main" depois do merge.
const BRANCH = 'claude/fervent-brown-l9uyi1'

export default defineRailway((ctx) => {
  const db = postgres('postgres')

  // Mesma imagem (Dockerfile) para web e trabalhador; muda só o comando.
  const build = { builder: 'DOCKERFILE' as const, dockerfilePath: 'Dockerfile' }

  const web = service('web', {
    source: github(REPO, { branch: BRANCH }),
    build,
    // Confere variáveis, aplica migrações e cria a primeira administração antes da troca de versão.
    preDeploy: './node_modules/.bin/tsx scripts/predeploy.ts',
    start: 'node .output/server/index.mjs',
    healthcheck: '/api/v1/health',
    healthcheckTimeout: 120,
    deploy: { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 5 },
    // Domínio próprio: descomente depois de criar o CNAME no DNS e troque APP_BASE_URL.
    // domains: ['guilda.anglicanaporto.com.br'],
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      APP_BASE_URL: 'https://${{RAILWAY_PUBLIC_DOMAIN}}',
      SESSION_COOKIE_SECURE: 'true',
      WHATSAPP_ALLOW_REAL_SEND: 'false',
      ESTEVAO_API_URL: 'https://api.caminhoanglicano.com.br',
      // Definidos pelo CLI, nunca no repositório:
      SECRETS_ENCRYPTION_KEY: preserve(),
      ESTEVAO_API_KEY: preserve(),
      BOOTSTRAP_ADMIN_PHONE: preserve(),
      BOOTSTRAP_ADMIN_NAME: preserve(),
      BOOTSTRAP_ADMIN_PASSWORD: preserve(),
    },
  })

  // Envia a fila do WhatsApp e dispara lembretes e pedidos agendados. Sem domínio público.
  const worker = service('worker', {
    source: github(REPO, { branch: BRANCH }),
    build,
    start: './node_modules/.bin/tsx worker/index.ts',
    deploy: { restartPolicyType: 'ALWAYS' },
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      APP_BASE_URL: 'https://${{web.RAILWAY_PUBLIC_DOMAIN}}',
      SECRETS_ENCRYPTION_KEY: '${{web.SECRETS_ENCRYPTION_KEY}}',
      WHATSAPP_ALLOW_REAL_SEND: '${{web.WHATSAPP_ALLOW_REAL_SEND}}',
    },
  })

  return project(ctx.projectName ?? 'guilda', {
    resources: [group('Guilda', [db, web, worker])],
  })
})
