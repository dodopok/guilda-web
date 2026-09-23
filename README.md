# Guilda Web

Escalas, confirmações, lembretes pelo WhatsApp e roteiros de culto para igrejas. A primeira comunidade é a Anglicana Porto; cada igreja tem seus dados isolados das demais.

- Interface em Vue e Nuxt 4 (português, pensada para o celular).
- API HTTP versionada em `/api/v1` (Nitro, TypeScript), pronta para um futuro app Flutter — ver [docs/api.md](docs/api.md) e [docs/openapi.json](docs/openapi.json).
- PostgreSQL com migrações (Drizzle).
- Trabalhador separado para tarefas agendadas: pedido mensal de indisponibilidades, lembrete semanal, correções depois do lembrete e fila de mensagens.
- WhatsApp oficial pelo YCloud (parceiro da Meta, com coexistência) ou direto pela Cloud API, com **modo de simulação local claramente identificado**. Nenhuma mensagem real sai sem canal configurado, coexistência comprovada, modelo aprovado, consentimento da pessoa e `WHATSAPP_ALLOW_REAL_SEND=true`.

## Rodar localmente

Requisitos: Node.js 22.12 ou mais novo, pnpm 10 (`corepack enable`), Docker.

```bash
cp .env.example .env
# gere a chave de cifragem dos segredos e cole em SECRETS_ENCRYPTION_KEY:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

docker compose up -d db        # PostgreSQL 17 (cria também o banco guilda_test)
pnpm install
pnpm db:migrate                # aplica as migrações
pnpm db:seed                   # dados FICTÍCIOS de exemplo
pnpm dev                       # http://localhost:3000
pnpm worker                    # em outro terminal: tarefas agendadas e envio da fila
```

Para não abrir dois terminais em desenvolvimento, use `WORKER_INLINE=true` no `.env`: o próprio `pnpm dev` roda o ciclo do trabalhador (ignorado em produção).

Para ver a integração com o Estêvão sem chave real, rode `pnpm estevao:mock` e use `ESTEVAO_API_URL=http://localhost:4010` e `ESTEVAO_API_KEY=local-mock`. O servidor simulado imita o contrato real com dados fictícios.

### Acessos de exemplo (somente dados fictícios locais)

| Perfil | Login | Senha |
| --- | --- | --- |
| Coordenação | `+5551900000001` | `guilda-demo-123` |
| Pastor | `+5551900000002` | `guilda-demo-123` |
| Voluntária | `+5551900000004` | `guilda-demo-123` |
| Administração da plataforma | `admin@guilda.local` | `guilda-admin-local` |

Há uma segunda igreja fictícia (`/i/exemplo`) para demonstrar o isolamento. `pnpm db:reset` apaga e recria o banco local (recusa bancos que não sejam locais).

### Tudo em contêineres

```bash
docker compose --profile app up --build
```

Sobe PostgreSQL, a aplicação (aplica migrações ao iniciar) e o trabalhador. Depois rode `pnpm db:seed` apontando para o banco se quiser os dados de exemplo.

## Verificações

```bash
pnpm lint          # ESLint (regras do Nuxt)
pnpm typecheck     # vue-tsc (app e servidor) + tsc (trabalhador, scripts, testes)
pnpm test          # Vitest: regras de domínio contra PostgreSQL real (banco guilda_test)
pnpm build         # build de produção
pnpm test:e2e      # Playwright: fluxos pela interface e segurança da API (usa o build)
pnpm check         # tudo acima, em ordem
pnpm docs:openapi  # regenera docs/openapi.json
```

Os testes de ponta a ponta recriam o banco `guilda_e2e`, sobem o build na porta 3100, o trabalhador real e o Estêvão simulado. Se o Chromium do Playwright não estiver instalado, use `PLAYWRIGHT_CHROMIUM_PATH=/caminho/do/chrome`.

## Organização

| Pasta | Conteúdo |
| --- | --- |
| `app/` | Telas Vue: participante (`/i/:igreja`) e coordenação (`/i/:igreja/coordenacao`) |
| `server/api/v1/` | Rotas HTTP (finas: validam e chamam os serviços) |
| `server/services/` | Regras de negócio, sem dependência do Nuxt (usadas também pelo trabalhador e pelos testes) |
| `server/integrations/` | Clientes do YCloud, da WhatsApp Cloud API e do Estêvão |
| `server/db/` | Esquema Drizzle e migrações SQL |
| `worker/` | Processo do trabalhador |
| `scripts/` | Migração, dados fictícios, OpenAPI, Estêvão simulado |
| `tests/services`, `tests/e2e` | Testes de domínio e de ponta a ponta |

## Documentação

- [Instalação, operação e produção](docs/operacao.md)
- [API v1](docs/api.md) e [OpenAPI](docs/openapi.json)
- [Integrações: WhatsApp e Estêvão](docs/integracoes.md) — inclui o que ainda falta validar
- [Segurança e privacidade](docs/seguranca.md)
- [Decisões](docs/decisoes.md), [arquitetura](docs/arquitetura.md), [modelo e regras](docs/modelo-e-regras.md), [múltiplas igrejas](docs/multiplas-igrejas.md), [visão](docs/visao.md)
- Etapas do primeiro lançamento: [0](docs/etapas/00-descoberta.md) · [1](docs/etapas/01-base.md) · [2](docs/etapas/02-escalas.md) · [3](docs/etapas/03-lembretes.md) · [4](docs/etapas/04-confirmacoes.md) · [5](docs/etapas/05-liturgia.md) · [6](docs/etapas/06-estevao.md)
- Descoberta: [planilha](docs/descoberta/diagnostico-da-planilha.md), [funções](docs/descoberta/catalogo-de-funcoes.md), [importação](docs/descoberta/mapeamento-de-importacao.md), [roteiros Porto](docs/descoberta/analise-roteiros-porto.md), [coleta mensal](docs/descoberta/coleta-de-indisponibilidade.md), [lembrete semanal](docs/descoberta/contrato-do-lembrete.md), [viabilidade do WhatsApp](docs/descoberta/viabilidade-whatsapp.md)
- [Checklist de implementação](TASKS.md)
