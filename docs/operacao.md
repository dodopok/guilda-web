# Instalação, operação e produção

## Componentes

| Processo | Comando | Função |
| --- | --- | --- |
| Web + API | `node .output/server/index.mjs` (após `pnpm build`) | Interface Vue (SPA) e API `/api/v1` |
| Trabalhador | `pnpm worker` (ou `tsx worker/index.ts`) | A cada `WORKER_INTERVAL_SECONDS`: pedidos mensais de indisponibilidade, lembretes semanais, correções pós-lembrete e envio da fila de mensagens |
| PostgreSQL 17 | `docker compose up -d db` | Único armazenamento |

O trabalhador pode ter mais de uma instância: execuções, correções e mensagens são protegidas por restrições únicas no banco e a fila usa `FOR UPDATE SKIP LOCKED`. `pnpm worker --once` roda um ciclo e sai (útil com cron externo).

## Variáveis de ambiente

Todas estão em [.env.example](../.env.example). Em produção:

| Variável | Obrigatória | Observação |
| --- | --- | --- |
| `DATABASE_URL` | sim | |
| `APP_BASE_URL` | sim | Endereço público; usado nos links de convite, senha, lembrete e roteiro e na checagem de origem (CSRF) |
| `SESSION_COOKIE_SECURE` | sim, `true` | Cookie só por HTTPS |
| `SECRETS_ENCRYPTION_KEY` | sim | 32 bytes em base64. Cifra tokens do WhatsApp e links de convite na fila. Trocar a chave invalida os segredos guardados (recadastre as credenciais) |
| `PASSWORD_SCRYPT_LOG2N` | não (17) | Custo do scrypt. O custo fica gravado em cada hash |
| `WHATSAPP_ALLOW_REAL_SEND` | não (false) | Trava global: sem `true`, nenhum envio real acontece em nenhuma igreja |
| `WHATSAPP_GRAPH_VERSION` | não (v25.0) | Versão da Graph API |
| `YCLOUD_API_BASE_URL` | não (https://api.ycloud.com) | Endereço da API do YCloud |
| `ESTEVAO_API_URL`, `ESTEVAO_API_KEY` | não | Sem elas, o roteiro funciona com preenchimento manual |
| `WORKER_INTERVAL_SECONDS` | não (30) | |
| `REMINDER_CATCHUP_HOURS` | não (6) | Atraso máximo para disparar um lembrete perdido (trabalhador parado). Depois disso, a semana é pulada em vez de mandar lembrete fora de hora |
| `RATE_LIMIT_FACTOR` | não (1) | Multiplica os limites de tentativa. Só para testes |

## Migrações

`pnpm db:migrate` aplica as migrações de `server/db/migrations`. Para mudar o esquema: edite `server/db/schema.ts`, rode `pnpm db:generate --name descricao`, revise o SQL gerado e faça commit. No Docker Compose (`--profile app`) a migração roda antes de iniciar o servidor web.

## Implantação sugerida

1. Build da imagem (`Dockerfile`) — a mesma imagem roda web e trabalhador.
2. Proxy reverso com HTTPS na frente do web. Repasse `X-Forwarded-For` (limites por IP) e `X-Forwarded-Host`.
3. Um processo web e um trabalhador. Limites de tentativa são em memória: com várias instâncias web, adicione limite no proxy.
4. Backups diários do PostgreSQL. O banco contém telefones e consentimentos: backups herdam o mesmo cuidado.
5. `GET /api/v1/health` para monitoramento.

Não há implantação configurada neste repositório.

## Rotina da coordenação

1. **Cadastro inicial**: funções e instruções → pessoas com telefone e funções → consentimento de cada pessoa → convites. Opcional: importar um mês da planilha para conferir.
2. **Todo mês**: cadastrar os cultos do mês seguinte → agendar o pedido de indisponibilidades (a tela sugere antecipar para o fim do mês anterior quando o primeiro culto cai cedo) → acompanhar quem respondeu → montar a escala → publicar escolhendo se avisa agora.
3. **Toda semana**: nada. O lembrete sai sozinho no dia e hora configurados; mudanças depois dele geram correção só para quem foi afetado. A tela Mensagens mostra quem ficou de fora e por quê.
4. **Roteiro**: criar a partir do modelo → buscar sugestões do Estêvão (ou preencher à mão) → atribuir leitores → quem prega escolhe as músicas e avisa o louvor → publicar. Mudanças na escala depois da publicação aparecem como "revisão necessária", sem alterar o publicado.

## Mensagens que não saíram

Estados na tela Mensagens:

| Estado | Significado | O que fazer |
| --- | --- | --- |
| Não enviada (`blocked`) | Sem telefone, sem consentimento, canal desativado ou requisito do canal oficial pendente. O motivo aparece na linha | Corrigir o motivo e usar "Tentar de novo" |
| Na fila | Aguardando o trabalhador | Verificar se o trabalhador está rodando |
| Falhou | O provedor (YCloud ou Meta) recusou (erro definitivo) ou esgotou 5 tentativas com espera crescente | Ler o erro; "Reenviar" |
| Incerta (`unknown`) | O processo caiu durante a chamada à Meta; pode ter sido entregue | Conferir com a pessoa antes de reenviar |
| Simulada — não enviada | Modo de simulação | Nada: ninguém recebeu |
| Enviada / Entregue / Lida | Confirmado pelo provedor (webhook) | — |

Reenviar reaproveita a mesma mensagem (mesma chave de idempotência) e nunca altera a escala.
