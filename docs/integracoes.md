# Integrações

## WhatsApp pelo YCloud (provedor escolhido para Porto)

O YCloud é parceiro oficial da Meta, conecta um número que já está no aplicativo WhatsApp Business por **coexistência** e repassa o custo das mensagens da Meta sem margem no plano gratuito. Na Guilda ele é um modo do canal (`ycloud`), ao lado da Cloud API direta, e passa pelas **mesmas travas**: consentimento, `WHATSAPP_ALLOW_REAL_SEND=true`, credenciais completas, coexistência registrada, modelo aprovado e, em modo de teste, só números da lista.

### Contrato (conferido na documentação do YCloud em 23/09/2026)

- **Envio**: `POST {YCLOUD_API_BASE_URL}/v2/whatsapp/messages/sendDirectly` com cabeçalho `X-API-Key`. Corpo: `from` (número da igreja em E.164), `to` (E.164), `type: "template"`, `template` no mesmo formato da Cloud API e `externalId` com o id da mensagem na fila da Guilda. A resposta traz `id` (guardado como identificador do provedor) e `status`; `status: "failed"` com 200 é tratado como falha (temporária quando `whatsappApiError.is_transient`). HTTP 5xx e 429 voltam para a fila com espera crescente.
- **Webhook**: `POST /api/v1/webhooks/ycloud`. Cabeçalho `YCloud-Signature: t={unix},s={hex}` com `s = HMAC-SHA256(segredo do endpoint, "{t}.{corpo bruto}")`; a Guilda recusa assinatura errada e horário com mais de 5 minutos de diferença. Eventos usados: `whatsapp.message.updated` (`whatsappMessage.id`, `status` sent/delivered/read/failed, `errorCode`, `errorMessage`, horários) e `whatsapp.inbound_message.received` (`whatsappInboundMessage.from`, `to`, `text.body`), para PARAR. O canal é achado pelo número da igreja (`whatsappMessage.from` ou `whatsappInboundMessage.to`); cada número só pode estar em uma igreja. O `id` do evento evita processamento duplicado.

### Como ligar (coordenação)

1. No YCloud: criar a chave em *Developers → API Keys*; criar o endpoint de webhook com a URL mostrada na tela "Canal do WhatsApp" e os dois eventos acima; guardar o segredo do endpoint.
2. Na Guilda, tela "Canal do WhatsApp": escolher "Canal oficial pelo YCloud", informar o número, a chave e o segredo (ficam cifrados e nunca voltam ao navegador). Deixar o **modo de teste** ligado com um ou dois números de quem autorizou.
3. Cadastrar os modelos no YCloud (*WhatsApp → Templates*) exatamente como a tela do canal mostra (nome, categoria, idioma pt_BR, texto e, para cada variável, o **nome** e o **exemplo**); marcar como aprovados na Guilda quando a Meta aprovar. Ver "Modelos de mensagem" abaixo.
4. Com `WHATSAPP_ALLOW_REAL_SEND=true` no servidor, enviar um lembrete de teste, conferir que chegou e que o aplicativo WhatsApp Business continua enviando e recebendo no mesmo número; então registrar a comprovação de coexistência.
5. Só depois desligar o modo de teste.

### Não validado

1. Envio real pelo YCloud e chegada dos webhooks (sem credenciais nesta implementação; testado por contrato em `tests/services/whatsapp.test.ts`).
2. Formato exato do corpo de erro HTTP do YCloud: a leitura é tolerante (`error.code`, `error.message`, `error.whatsappApiError`) e cai no código HTTP.
3. Se o YCloud envia `whatsappMessage.from` em todos os eventos de estado (a documentação mostra o objeto `WhatsappMessage` completo); se não enviar, o evento é recusado com 401 e aparece nos registros do YCloud.

## Modelos de mensagem

Lições da primeira submissão (convite e senha rejeitados; YCloud recusou `{{1}}`):

- **Variáveis nomeadas.** Todos os modelos de utilidade usam variáveis com nome (`{{nome}}`, `{{igreja}}`, `{{link}}`…), e cada uma é cadastrada com um exemplo. O envio informa `parameter_name` de cada variável (Cloud API e YCloud).
- **Senha é autenticação, e autenticação só leva código.** A Meta recusa como utilidade qualquer mensagem de senha ou acesso, e o modelo de autenticação não aceita link nem texto livre: é o texto padrão da Meta com o código e o botão "Copiar código". Por isso "Esqueci minha senha" agora envia **um código de 6 dígitos** (`guilda_codigo`, validade de 10 minutos, 5 tentativas, um pedido a cada 2 minutos); a pessoa digita o código no app e cria a senha nova. O código vai também no botão (componente `button`, `sub_type: url`, índice 0), como a Meta exige.
- **Convite é utilidade sem falar em senha.** O texto virou um aviso de inclusão na escala com o link individual ("…incluiu você na escala… Por este link você vê suas tarefas e confirma presença"), sem as palavras senha, acesso, login ou código. A criação da senha acontece na página do link.
- A coordenação **não** reenvia acesso de quem já tem conta (não pode trocar a senha de ninguém): a própria pessoa usa "Esqueci minha senha".
- Códigos nunca aparecem no painel, nem em simulação. Fora de produção, o código simulado vai só para o log do servidor.
- A migração `0005` voltou para "rascunho" a situação dos modelos guardada nas igrejas: os textos mudaram e precisam ser submetidos de novo.

Se a Meta ainda recategorizar o convite, a saída é transformá-lo em aviso sem link (a pessoa entra pelo site com o celular e recebe um código), o que não exige mudança no banco.

## WhatsApp (Cloud API direta)

### O que está implementado

- **Canal por igreja** (`whatsapp_channels`): modo `disabled`, `simulation` ou `cloud_api`; phone number ID, WABA ID, token de acesso e app secret cifrados; token de verificação do webhook guardado como hash; modo de teste com lista de números; situação de cada modelo de mensagem; registro da comprovação de coexistência (quem, quando, como).
- **Fila única** (`outbound_messages`) com chave de idempotência por igreja. Motivos de bloqueio visíveis: sem telefone, sem consentimento, canal desativado, envio real desligado no servidor, credenciais incompletas, coexistência não comprovada, modelo não aprovado, número fora da lista de teste.
- **Envio** por `POST {graph}/{versão}/{phone-number-id}/messages` com mensagem do tipo `template` e parâmetros de corpo. Parâmetros são limpos de quebras de linha e espaços repetidos (a Cloud API os rejeita). Erros temporários (5xx, 429, limites 130429/131048/131056…) voltam à fila com espera de 1, 5, 15 e 60 minutos até 5 tentativas; erros definitivos ficam como falha com o código da Meta. Mensagem presa em envio vira "incerta" e não é reenviada sozinha.
- **Webhook** `POST /api/v1/webhooks/whatsapp`: assinatura `X-Hub-Signature-256` obrigatória com o app secret do canal, estados `sent → delivered → read` sem regressão, `failed` com motivo, eventos duplicados ignorados, resposta "PARAR/SAIR/STOP" revoga o consentimento. `GET` responde ao desafio `hub.challenge`.
- **Nunca cai na simulação**: com o canal em `cloud_api` e algum requisito faltando, a mensagem fica bloqueada com o motivo. Simulação só acontece no modo `simulation`, com estado próprio ("Simulada — não enviada"), faixa permanente na interface e identificador `sim-…`.
- **Modelos** (em `server/services/messaging/templates.ts` e na tela do canal): boas-vindas à escala, código para nova senha, pedido de indisponibilidade, lembrete semanal, correção de lembrete, escala publicada, escala alterada, pedido de troca, músicas do culto, aviso de leitura e aviso à coordenação. Ver "Modelos de mensagem".

### Testado

- Contrato por teste automatizado (`tests/services/whatsapp.test.ts`): formato exato do payload, URL e cabeçalho `Authorization`, cada motivo de bloqueio, reenvio controlado, falha temporária × definitiva, assinatura do webhook, idempotência e ordem dos estados, PARAR e verificação do webhook.
- Fluxo completo em simulação pela interface (`tests/e2e`).

### Não validado (depende de acesso externo)

1. **Coexistência do número atual de Porto**. Pela documentação da Meta (integração de usuários do aplicativo WhatsApp Business, também chamada de coexistência), é preciso passar pelo Embedded Signup de um **Tech Provider ou Solution Partner**, usar o aplicativo 2.24.17 ou mais novo e sincronizar o histórico em até 24 horas. Recursos que mudam no aplicativo após a integração incluem: listas de transmissão ficam somente leitura; mensagens temporárias, de visualização única e localização em tempo real deixam de funcionar em conversas individuais; a vazão fica fixa em 20 mensagens por segundo. **Nenhuma migração ou conexão do número foi feita.** Não use o cadastro comum de número da Cloud API com o número de Porto: ele remove o número do aplicativo.
2. Aprovação dos modelos na Meta (textos prontos na tela do canal).
3. Um envio real para número de teste que autorizou, com o aplicativo ainda funcionando no mesmo número.
4. Entrega real de webhooks (URL pública com HTTPS e assinatura do app).
5. Custos e limites da conta (consultar no painel da Meta com o volume real).

Até esses itens serem comprovados e registrados na tela "Canal do WhatsApp", a integração fica **implementada e testada por contrato, mas não validada com a Meta**.

## Estêvão (API v2)

### Contrato

Conferido na instância `https://api.caminhoanglicano.com.br` com uma chave de teste (contrato publicado em `/api-docs/v2/swagger.yaml`):

- `GET /api/v2/days/:data?book=…&service=eucharist&reading_type=complementary|semicontinuous&include=readings,readings.alternatives,collect.text,celebrations`, cabeçalho `X-API-Key`. `book` é obrigatório na v2 (sem padrão silencioso) e vem da configuração da igreja.
- Resposta `{ data, meta }`: `season.name`, `color`, `sunday_name`, `celebration`, `celebrations[]`, `collect[]` (`title`, `kind`, `text`) e `readings[]` como **lista com `slot`** (`first_reading`, `psalm`, `second_reading`, `gospel`…), `reference` e `alternatives`. Slots desconhecidos entram como "Leitura".
- Nunca pedimos `readings.text`: o texto bíblico não trafega nem é guardado.
- `GET /api/v2/prayer-books?lang=pt-BR` alimenta a escolha do livro em Configurações (guardado em memória por uma hora).
- Erros `application/problem+json` com `code` estável (`UNKNOWN_PRAYER_BOOK`, `RATE_LIMITED`, `MISSING_API_KEY`…) viram mensagens em português.
- Observado na instância (difere do texto do desenho da v2): a cor vem em português (`verde`), e chave inválida responde `401 MISSING_API_KEY` em vez de um código próprio. A Guilda aceita cor em inglês ou português.
- `reading_type` não aparece no swagger de `/days/:data`, mas é aceito: com `complementary` e `semicontinuous` a primeira leitura e o salmo mudam como esperado.

Conferência manual, sem gravar nada: `ESTEVAO_API_URL=… ESTEVAO_API_KEY=… npx tsx scripts/estevao-check.ts 2026-10-11 loc_2015 complementary`.

### Comportamento na Guilda

- A coordenação busca as sugestões do dia do culto; a resposta é validada e guardada como **foto** (`liturgical_snapshots`) com caminho da consulta e horário, sem a chave.
- Ela escolhe a coleta e **quantas leituras quiser** (inclusive alternativas); cada leitura vira um bloco com referência, função e pessoa próprias. A pessoa atribuída a cada posição de leitura é mantida ao reaplicar.
- A coleta é guardada para uso da própria igreja.
- A versão publicada do roteiro copia os dados escolhidos e a foto usada; nova resposta do Estêvão não altera o publicado.
- Em falha (sem configuração, rede, HTTP, formato, limite de consultas), a tela explica, oferece a última foto guardada e o preenchimento manual. Escala, lembretes e confirmações não dependem do Estêvão.
- `pnpm estevao:mock` sobe um servidor local com o mesmo contrato v2 e dados fictícios.

### Não validado

1. Cobertura de datas do livro escolhido para os meses de uso e festas transferidas.
2. **Direitos de exibição e redistribuição** dos textos do LOC (coleta e ritos) e dos textos bíblicos. Por isso: textos do LOC ficam restritos à igreja que os cadastrou, os modelos de exemplo têm apenas marcadores, e não há cópia de modelos entre igrejas. Confirmar com os detentores dos direitos antes de oferecer modelos a outras comunidades.

## Roteiro, músicas e avisos

Roteiro montado no app a partir de modelo, escala e Estêvão; revisão pastoral informal (nota da pastoral, sem bloqueio); publicação versionada pela coordenação; leitura no celular; exportação em HTML imprimível, texto e JSON. Músicas ficam no repertório da igreja (sem letras, só título, autor, tom e link) e o aviso individual vai só às pessoas escaladas em funções marcadas para recebê-lo. Envio automático do roteiro e publicação em grupos continuam fora do primeiro lançamento.
