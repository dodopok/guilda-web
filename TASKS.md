# Checklist do primeiro lançamento

Legenda: [x] feito e testado · [~] implementado, depende de validação externa · [ ] não feito

## Base (etapa 1)

- [x] Nuxt 4 + Nitro + PostgreSQL + Drizzle, migrações, `.env.example`, Docker Compose, dados fictícios (`pnpm db:seed`)
- [x] Isolamento por igreja no banco (FKs compostas) e nos serviços; 404 para outra igreja — `tests/services/tenancy.test.ts`, `tests/e2e/api.spec.ts`
- [x] Contas, senha própria (scrypt), sessões (cookie e Bearer), CSRF por origem, bloqueio por tentativas
- [x] Convite individual de uso único, expira em 72 h, só ativa a pessoa convidada — `auth.test.ts`, e2e fluxo 1
- [x] Recuperação de acesso (pedido pela pessoa e reenvio pela coordenação)
- [x] Papéis por igreja: coordenação, pastoral, voluntário; quem prega pela escala
- [x] Pessoas, telefones, consentimento com origem e revogação, ministérios, funções com instruções e chegada, habilitações, cultos (vários por dia), postos com várias pessoas
- [x] Auditoria (tela Histórico)
- [x] Importação de um mês da planilha com prévia, conciliação de nomes e idempotência — `import.test.ts`
- [x] Configuração de dia, horário e fuso do lembrete

## Fluxo 1 — Cadastro e convites

- [x] Coordenação cadastra igreja (administração da plataforma), pessoas, telefones, funções, habilitações, cultos e instruções
- [x] Convite individual, criação de senha, acesso só à própria igreja — e2e fluxo 1 e isolamento

## Fluxo 2 — Coleta de indisponibilidades (etapa 2)

- [x] Cultos do mês cadastrados antes do pedido (exigido pelo servidor)
- [x] Mensagem agendada com link, prazo e mês; envio antecipado (sugestão automática quando o primeiro culto cai cedo) e "enviar agora"; idempotente por pessoa — `availability.test.ts`
- [x] Pessoa marca só as próprias indisponibilidades (Posso / Não posso)
- [x] Painel distingue respondeu × silêncio; resposta registrada pela coordenação; alterações após prazo; culto novo depois do pedido
- [x] Indisponibilidade depois da publicação alerta a coordenação sem mudar a escala

## Fluxo 3 — Escala (etapa 2)

- [x] Editor em grade (funções × cultos) e por culto no celular
- [x] Alertas: vagas, recusas, indisponíveis, sem habilitação, choques, carga no mesmo dia, sem domingo livre (pastores fora), sem tarefa, excepcionais — `schedule.test.ts`
- [x] Painel de carga por pessoa
- [x] Publicação versionada com escolha de aviso imediato; histórico com versão anterior, autor e motivo
- [x] Visualização móvel e impressão

## Fluxo 4 — Confirmações e trocas (etapa 4)

- [x] Minhas escalas com data, horário, local, função, instruções; confirmar/recusar com recado
- [x] Substitutos só habilitados para a mesma função, sem indisponibilidade nem choque
- [x] Troca vale só no aceite; aceitações simultâneas não geram dois responsáveis — `responses.test.ts`
- [x] Designação excepcional pela coordenação com motivo registrado
- [x] Pendências e aviso à coordenação sobre recusa e troca concluída
- [x] Mudança na tarefa torna pendente só a confirmação afetada; resposta sobre versão antiga é recusada
- [ ] Confirmação respondendo pelo WhatsApp (avaliada; fora deste lançamento)

## Fluxo 5 — Lembrete semanal (etapa 3)

- [x] Disparo no dia/horário configurados em America/Sao_Paulo, uma mensagem por pessoa com as tarefas dos 7 dias — `reminders.test.ts`
- [x] Idempotente (reprocessar não duplica); tolerância para trabalhador atrasado
- [x] Correção automática só para afetados após mudança, troca ou cancelamento; recusa própria não gera correção
- [x] Prévia com destinatários e quem fica de fora; envios anteriores com estado por pessoa; falhas e reenvio
- [~] Envio real pela Cloud API com modelo aprovado (ver "Depende de acesso externo")

## Fluxo 6 — Roteiro (etapa 5)

- [x] Modelos com blocos, textos do LOC cadastrados pela coordenação, duplicação para festas e cultos curtos
- [x] Roteiro a partir do modelo e da escala (responsáveis vêm da escala, com estado de confirmação)
- [x] Leituras em número variável, cada uma com referência e pessoa; coleta, ritos, sermão, avisos com dono e estado
- [x] Músicas no app escolhidas por quem prega (ou pastores) e aviso individual ao louvor — `liturgy.test.ts`
- [x] Revisão pastoral informal; publicação versionada; leitura no celular; exportação HTML/texto/JSON
- [x] Mudança na escala após publicar sinaliza revisão sem alterar o publicado

## Fluxo 7 — Estêvão (etapa 6)

- [x] Cliente conforme o contrato do código-fonte do estevao-api (calendário, cor, celebração, coleta, leituras LOC 2027)
- [x] Foto dos dados escolhidos preservada na versão publicada; histórico de origem
- [x] Falha externa: último dado guardado + preenchimento manual; demais fluxos não dependem
- [x] Servidor simulado local (`pnpm estevao:mock`)
- [~] Validação com a instância real e chave de desenvolvimento
- [~] Direitos de exibição do LOC antes de distribuir a outras igrejas

## WhatsApp oficial

- [x] Canal por igreja, consentimento, modelos, fila, reenvio controlado, estados de entrega, webhook assinado, PARAR
- [x] Modo de simulação local claramente identificado; canal oficial nunca cai na simulação
- [x] Provedor YCloud (envio direto com `X-API-Key`, webhook `YCloud-Signature`) além da Cloud API direta, com as mesmas travas; testado por contrato
- [~] Número de Porto conectado no YCloud (feito pela coordenação); falta cadastrar as credenciais na tela do canal e registrar a comprovação de coexistência
- [~] Aprovação dos modelos, envio de teste real, webhooks públicos, custos

## Novo layout (Guilda.dc.html)

- [x] Casca, cor da igreja, logo, configuração inicial, Mesa, Preparar mês em 4 passos, Pessoas e funções, Configurações
- [x] Telas do voluntário: Início, Disponibilidade, Escala, Roteiro, Você, Suas escalas, Detalhe da tarefa, Pedidos de troca
- [x] Portas: Entrar, Convite (3 passos), Esqueci minha senha, Nova senha (entra direto), Escolher igreja, Nova igreja
- [x] Ferramentas: Mensagens enviadas, Canal do WhatsApp (checklist com último webhook assinado e autorizações), Modelos de liturgia, Editar modelo, Repertório, Importar planilha (colar, .xlsx/.csv, conferir, criar pessoa), Histórico
- [x] Exceção na escala em folha própria, com motivo obrigatório; "Quem prega?" no roteiro; aviso de escala alterada com "Atualizar no roteiro"
- Diferenças deliberadas do protótipo: senha com no mínimo 10 caracteres (o protótipo fala em 8); "Reenviar" só para mensagens que não chegaram (reenviar entregue duplicaria); "Link enviado" não confirma se o número tem conta (evita enumeração); Nova igreja mostra o convite uma única vez em vez de enviar, porque a igreja nova ainda não tem canal.

## Qualidade

- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` (Vitest com PostgreSQL), `pnpm build`, `pnpm test:e2e` (Playwright)
- [x] Documentação: README, operação, API + OpenAPI, integrações, segurança, decisões
- [x] Imagem Docker única (web e trabalhador) testada localmente
- [ ] Política de retenção e exclusão de dados pessoais (decisão pendente)
- [ ] Implantação (não faz parte deste trabalho)

## Depende de acesso externo

1. Na tela do canal: número, chave de API e segredo do webhook do YCloud; cadastrar a URL do webhook no YCloud; comprovar a coexistência com um envio de teste.
2. Aprovação dos modelos em `docs/integracoes.md` / tela do canal.
3. Número de teste que autorizou receber mensagens.
4. Chave definitiva do Estêvão no ambiente de produção (`ESTEVAO_API_KEY`); a integração v2 já foi conferida na instância real com uma chave de teste.
5. Confirmação dos direitos de uso dos textos do LOC.
